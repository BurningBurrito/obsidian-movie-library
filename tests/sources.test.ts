import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { MediaError } from '../src/core/errors';
import type { MediaType } from '../src/media/types';
import { configuredSources, forgetFailures, parseQuery, searchTitles, SOURCES } from '../src/sources';
import { normalizeGenres, preferYear } from '../src/sources/common';
import type { MediaSource, SearchQuery, SearchResult, SourceId } from '../src/sources/types';
import { resetNetwork, setOnline } from './support/network';
import { sampleTitle } from './support/titles';
import { makeApp, makePlugin } from './support/vault';

describe('reading the search text', () => {
	it('finds a year in parentheses, an IMDb ID or link, and a MyAnimeList link', () => {
		assert.deepEqual(parseQuery('  Dune (2021) '), { text: 'Dune', year: 2021, imdbId: null, malId: null });
		assert.deepEqual(parseQuery('Blade Runner 2049'), { text: 'Blade Runner 2049', year: null, imdbId: null, malId: null }, 'a bare number is part of the title');
		assert.equal(parseQuery('Brazil (0042)').year, null, 'not a plausible year');
		assert.equal(parseQuery('TT1375666').imdbId, 'tt1375666');
		assert.equal(parseQuery('https://www.imdb.com/title/tt11280740/?ref_=nv').imdbId, 'tt11280740');
		assert.equal(parseQuery('https://myanimelist.net/anime/52991/Sousou_no_Frieren').malId, 52991);
		assert.equal(parseQuery('52991').malId, null, 'a bare number is a title');
	});
});

describe('genres', () => {
	it('gives each genre one name across sources', () => {
		assert.deepEqual(normalizeGenres(['Science-Fiction', 'Sci-Fi & Fantasy', 'Slice of Life', 'Award Winning', 'Drama', 'drama']), [
			'Science fiction',
			'Fantasy',
			'Slice of life',
			'Drama',
		]);
		assert.deepEqual(normalizeGenres(['Action & Adventure', 'War & Politics', 'TV Movie']), ['Action', 'Adventure', 'War', 'Politics', 'TV movie']);
	});

	it('puts results from the searched year first', () => {
		const result = (year: number): SearchResult => ({ title: sampleTitle('tv', { year }), thumbnailUrl: '', ref: {} });
		const ordered = preferYear([result(2005), result(2001), result(2024)], 2001);
		assert.deepEqual(ordered.map((r) => r.title.year), [2001, 2005, 2024]);
	});
});

// Stand-in sources, so fallback can be tested before every real source exists.
type Behavior = 'results' | 'empty' | MediaError;
function standIn(id: SourceId, name: string, types: MediaType[], behavior: () => Behavior, configured = true) {
	const calls: SearchQuery[] = [];
	const source: MediaSource = {
		id,
		name,
		types,
		isConfigured: () => configured,
		search: (query, type) => {
			calls.push(query);
			const b = behavior();
			if (b instanceof MediaError) return Promise.reject(b);
			return Promise.resolve(b === 'empty' ? [] : [{ title: sampleTitle(type, { title: `${name} result` }), thumbnailUrl: '', ref: {} }]);
		},
		details: (result) => Promise.resolve(result.title),
		check: () => Promise.resolve('ok'),
	};
	return { source, calls };
}

describe('choosing and falling back between sources', () => {
	const original = [...SOURCES];
	const use = (...sources: MediaSource[]) => SOURCES.splice(0, SOURCES.length, ...sources);
	const plugin = (useFallback = true) => makePlugin(makeApp(), { useFallback });
	beforeEach(() => {
		forgetFailures();
		resetNetwork();
	});
	afterEach(() => use(...original));

	it('offers only configured sources that cover the type, in the agreed order', () => {
		const tmdb = standIn('tmdb', 'TMDB', ['movie', 'tv', 'anime'], () => 'results');
		const omdb = standIn('omdb', 'OMDb', ['movie', 'tv'], () => 'results', false);
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => 'results');
		const tenrai = standIn('tenrai', 'Tenrai', ['anime'], () => 'results');
		use(tmdb.source, omdb.source, tvmaze.source, tenrai.source);
		const ids = (type: MediaType) => configuredSources(plugin(), type).map((s) => s.id);
		assert.deepEqual(ids('movie'), ['tmdb'], 'OMDb has no key');
		assert.deepEqual(ids('tv'), ['tvmaze', 'tmdb']);
		assert.deepEqual(ids('anime'), ['tenrai', 'tmdb']);
	});

	it('falls back when the chosen source fails or finds nothing, and says why', async () => {
		let tvmazeBehavior: Behavior = new MediaError('server', 'TVmaze is having problems (error 503). Try again later.');
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => tvmazeBehavior);
		const tmdb = standIn('tmdb', 'TMDB', ['tv'], () => 'results');
		use(tvmaze.source, tmdb.source);
		const outcome = await searchTitles('severance', 'tv', plugin(), 'tvmaze');
		assert.equal(outcome.source.id, 'tmdb');
		assert.deepEqual(outcome.fallback, { from: 'TVmaze', reason: 'TVmaze is having problems (error 503). Try again later.' });

		forgetFailures();
		tvmazeBehavior = 'empty';
		const empty = await searchTitles('severance', 'tv', plugin(), 'tvmaze');
		assert.equal(empty.fallback?.reason, 'TVmaze found nothing.');
	});

	it('skips a source that just failed when falling back, but not when it’s chosen', async () => {
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => 'empty');
		const tmdb = standIn('tmdb', 'TMDB', ['tv'], () => new MediaError('timeout', 'TMDB took too long to respond. Try again later.'));
		const omdb = standIn('omdb', 'OMDb', ['tv'], () => 'results');
		use(tvmaze.source, tmdb.source, omdb.source);
		await searchTitles('x', 'tv', plugin(), 'tvmaze');
		assert.equal(tmdb.calls.length, 1);
		const again = await searchTitles('x', 'tv', plugin(), 'tvmaze');
		assert.equal(tmdb.calls.length, 1, 'TMDB skipped for 10 minutes');
		assert.equal(again.source.id, 'omdb');
		const chosen = await searchTitles('x', 'tv', plugin(), 'tmdb');
		assert.equal(tmdb.calls.length, 2, 'chosen with its button: tried anyway');
		assert.deepEqual(chosen.fallback, { from: 'TMDB', reason: 'TMDB took too long to respond. Try again later.' });
		assert.equal(chosen.source.id, 'omdb');

		const realNow = Date.now;
		Date.now = () => realNow() + 11 * 60_000;
		try {
			await searchTitles('x', 'tv', plugin(), 'tvmaze');
			assert.equal(tmdb.calls.length, 3, 'tried again after 10 minutes');
		} finally {
			Date.now = realNow;
		}
	});

	it('doesn’t fall back when fallback is off, when offline, or for "no key" problems', async () => {
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => 'empty');
		const tmdb = standIn('tmdb', 'TMDB', ['tv'], () => 'results');
		use(tvmaze.source, tmdb.source);
		await assert.rejects(searchTitles('nothing', 'tv', plugin(false), 'tvmaze'), /No TV shows found for "nothing"\. Try fewer words, or the IMDb ID\./);
		assert.equal(tmdb.calls.length, 0);

		setOnline(false);
		const offline = standIn('tvmaze', 'TVmaze', ['tv'], () => new MediaError('offline', 'You appear to be offline.'));
		use(offline.source, tmdb.source);
		await assert.rejects(searchTitles('x', 'tv', plugin(), 'tvmaze'), /offline/);
		assert.equal(tmdb.calls.length, 0);
	});

	it('reports the chosen source’s problem when nothing works, and nothing found everywhere', async () => {
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => new MediaError('rate-limited', 'TVmaze has received too many requests.'));
		const tmdb = standIn('tmdb', 'TMDB', ['tv'], () => 'empty');
		use(tvmaze.source, tmdb.source);
		await assert.rejects(searchTitles('x', 'tv', plugin(), 'tvmaze'), /TVmaze has received too many requests/);

		forgetFailures();
		const nothing = standIn('tvmaze', 'TVmaze', ['tv'], () => 'empty');
		use(nothing.source, tmdb.source);
		await assert.rejects(searchTitles('qwxz', 'tv', plugin(), 'tvmaze'), /No TV shows found for "qwxz" \(searched TVmaze, TMDB\)\./);
	});

	it('passes the year and IDs on to the source, and says when no source is set up', async () => {
		const tvmaze = standIn('tvmaze', 'TVmaze', ['tv'], () => 'results');
		use(tvmaze.source);
		await searchTitles('The Office (2001)', 'tv', plugin(), undefined);
		assert.deepEqual(tvmaze.calls[0], { text: 'The Office', year: 2001, imdbId: null, malId: null });
		await assert.rejects(searchTitles('Inception', 'movie', plugin(), undefined), /No movie source is set up/);
	});
});
