import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { clearCache, setUserAgent } from '../src/core/http';
import { parseQuery } from '../src/sources';
import { tvmaze } from '../src/sources/tvmaze';
import { fake, json, requests, resetNetwork } from './support/network';
import { makeApp, makePlugin } from './support/vault';

const plugin = () => makePlugin(makeApp());

describe('TVmaze (recorded answers)', () => {
	before(() => setUserAgent('WatchlistNotes/test (+https://github.com/BurningBurrito/obsidian-movie-library)'));
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('searches by name, identifying the plugin', async () => {
		const results = await tvmaze.search(parseQuery('severance'), 'tv', plugin());
		const show = results[0]?.title;
		assert.ok(show);
		assert.equal(show.title, 'Severance');
		assert.equal(show.year, 2022);
		assert.equal(show.firstAired, '2022-02-18');
		assert.equal(show.network, 'Apple TV', 'a streaming service, from webChannel');
		assert.ok(show.genres.includes('Science fiction'), `genres: ${show.genres.join(', ')}`);
		assert.match(show.posterDownloadUrl, /\/medium_portrait\//, 'the medium poster is saved');
		assert.match(show.posterUrl, /\/original_untouched\//, 'the full-size poster is linked');
		assert.equal(show.source.url, 'https://www.tvmaze.com/shows/44933/severance');
		assert.equal(show.source.key, 'tvmaze-44933');
		assert.equal(show.imdbId, 'tt11280740');
		assert.doesNotMatch(show.description, /<\/?p>/, 'HTML removed');
		assert.match(requests[0]?.headers['User-Agent'] ?? '', /^WatchlistNotes\/test \(\+https:\/\/github\.com\/BurningBurrito\/obsidian-movie-library\)$/);
	});

	it('fills in creators, cast, seasons, and episodes from one request', async () => {
		const [result] = await tvmaze.search(parseQuery('severance'), 'tv', plugin());
		const show = await tvmaze.details(result!, plugin());
		assert.deepEqual(show.creators, ['Dan Erickson']);
		assert.ok(show.cast.length > 0 && show.cast.length <= 5);
		assert.ok(show.cast.includes('Adam Scott'));
		assert.ok((show.seasons ?? 0) >= 2, `seasons: ${show.seasons}`);
		assert.ok((show.episodes ?? 0) >= 19, `episodes: ${show.episodes}`);
		assert.match(requests.at(-1)?.url ?? '', /\/shows\/44933\?embed%5B%5D=cast&embed%5B%5D=crew&embed%5B%5D=seasons$/);
	});

	it('looks up an IMDb ID directly, and finds nothing for an unknown one or nonsense', async () => {
		const byId = await tvmaze.search(parseQuery('tt11280740'), 'tv', plugin());
		assert.deepEqual(byId.map((r) => r.title.title), ['Severance']);
		assert.deepEqual(await tvmaze.search(parseQuery('tt0000001'), 'tv', plugin()), []);
		assert.deepEqual(await tvmaze.search(parseQuery('qwxzzvbnmlkj'), 'tv', plugin()), []);
	});

	it('puts shows from the year in parentheses first', async () => {
		const results = await tvmaze.search(parseQuery('The Office (2001)'), 'tv', plugin());
		assert.equal(results[0]?.title.year, 2001);
		assert.equal(results[0]?.title.network, 'BBC Two');
		assert.ok(results.length > 1, 'the other versions still follow');
	});

	it('reports problems in plain language', async () => {
		fake('/search/shows', json(503, {}));
		await assert.rejects(tvmaze.search(parseQuery('severance'), 'tv', plugin()), /TVmaze is having problems \(error 503\)/);
		fake('/shows/99999999', json(404, { name: 'Not Found', status: 404 }));
		await assert.rejects(
			tvmaze.details({ title: {} as never, thumbnailUrl: '', ref: { id: '99999999' } }, plugin()),
			/TVmaze has no entry for this title/,
		);
		fake('/search/shows', { status: 200, text: '<html>maintenance</html>' });
		clearCache();
		await assert.rejects(tvmaze.search(parseQuery('severance'), 'tv', plugin()), /TVmaze sent a response Watchlist Notes couldn't read/);
	});

	it('has a check for the settings', async () => {
		assert.equal(await tvmaze.check(plugin()), 'TVmaze is working.');
	});
});
