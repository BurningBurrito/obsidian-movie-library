import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import { parseQuery } from '../src/sources';
import { omdb, omdbDate } from '../src/sources/omdb';
import { fake, json, requests, resetNetwork } from './support/network';
import { omdbAnswers } from './support/stand-ins';
import { makeApp, makePlugin } from './support/vault';

const KEY = 'abc12345';
function plugin(key: string | null = KEY) {
	const app = makeApp();
	if (key) app.secretStorage.setSecret('omdb', key);
	return makePlugin(app, { omdbKeySecret: key ? 'omdb' : '' });
}
const result = (id: string, type: 'movie' | 'tv') => ({ title: { type } as never, thumbnailUrl: '', ref: { id } });

describe('OMDb (stand-in answers in its documented format)', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('searches movies and series, with the key in the address as OMDb requires', async () => {
		fake('s=inception', omdbAnswers.search());
		const results = await omdb.search(parseQuery('inception'), 'movie', plugin());
		assert.equal(requests[0]?.url, 'https://www.omdbapi.com/?s=inception&type=movie&apikey=abc12345');
		assert.deepEqual(results.map((r) => r.title.title), ['Inception', 'Inception: The Cobol Job']);
		assert.equal(results[0]?.title.posterDownloadUrl, 'https://m.media-amazon.com/images/M/test-inception._V1_SX300.jpg');
		assert.equal(results[1]?.title.posterDownloadUrl, '', '"N/A" is no poster');
		assert.equal(results[0]?.title.source.url, 'https://www.imdb.com/title/tt1375666/');
		assert.equal(results[0]?.title.source.key, 'imdb-tt1375666');

		fake('s=breaking', json(200, { Search: [], Response: 'True' }));
		await omdb.search(parseQuery('breaking bad'), 'tv', plugin());
		assert.match(requests[1]?.url ?? '', /type=series/);
	});

	it('reads a movie’s details', async () => {
		fake('i=tt1375666', omdbAnswers.movie());
		const movie = await omdb.details(result('tt1375666', 'movie'), plugin());
		assert.match(requests[0]?.url ?? '', /\?i=tt1375666&plot=full&apikey=abc12345$/);
		assert.equal(movie.releaseDate, '2010-07-16');
		assert.equal(movie.runtime, 148);
		assert.deepEqual(movie.directors, ['Christopher Nolan']);
		assert.deepEqual(movie.cast, ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page']);
		assert.deepEqual(movie.genres, ['Action', 'Adventure', 'Science fiction']);
		assert.equal(movie.score, 8.8);
		assert.equal(movie.imdbId, 'tt1375666');
	});

	it('reads a series: years, status, creators, seasons', async () => {
		fake('i=tt0903747', omdbAnswers.series());
		const ended = await omdb.details(result('tt0903747', 'tv'), plugin());
		assert.equal(ended.year, 2008);
		assert.equal(ended.firstAired, '2008-01-20');
		assert.equal(ended.lastAired, '2013');
		assert.equal(ended.status, 'Ended');
		assert.deepEqual(ended.creators, ['Vince Gilligan'], 'from Writer');
		assert.deepEqual(ended.directors, [], '"N/A"');
		assert.equal(ended.seasons, 5);
		assert.equal(ended.posterDownloadUrl, '');

		clearCache();
		fake('i=tt0903747', omdbAnswers.series('2019–'));
		assert.equal((await omdb.details(result('tt0903747', 'tv'), plugin())).status, 'Running');
	});

	it('looks up an IMDb ID directly, and reads field names in any capitals', async () => {
		fake('i=tt1375666', json(200, { title: 'Inception', year: '2010', imdbid: 'tt1375666', type: 'movie', poster: 'N/A', response: 'True' }));
		const [found] = await omdb.search(parseQuery('tt1375666'), 'movie', plugin());
		assert.equal(found?.title.title, 'Inception');
		assert.equal(found?.title.year, 2010);
	});

	it('turns OMDb’s error answers into plain messages', async () => {
		fake('s=nothing', omdbAnswers.error('Movie not found!'));
		assert.deepEqual(await omdb.search(parseQuery('nothing'), 'movie', plugin()), [], 'not found = no results');
		fake('s=a', omdbAnswers.error('Too many results.'));
		await assert.rejects(omdb.search(parseQuery('a'), 'movie', plugin()), /OMDb found too many results\. Try more words\./);
		fake('s=x', omdbAnswers.error('Invalid API key!', 401));
		await assert.rejects(omdb.search(parseQuery('x'), 'movie', plugin()), /OMDb rejected the key\. Check it in Settings → Watchlist Notes → OMDb\./);
		fake('s=y', omdbAnswers.error('Request limit reached!', 401));
		await assert.rejects(omdb.search(parseQuery('y'), 'movie', plugin()), /Your OMDb key has used up today's 1,000 requests\. Try again tomorrow/);
		await assert.rejects(omdb.search(parseQuery('z'), 'movie', plugin(null)), /OMDb needs a key/);
	});

	it('checks the key with a small lookup', async () => {
		fake('i=tt1375666', omdbAnswers.movie());
		assert.equal(await omdb.check(plugin()), 'OMDb is working: your key is valid.');
		assert.equal(omdb.isConfigured(plugin(null)), false);
	});

	it('reads OMDb dates', () => {
		assert.equal(omdbDate('16 Jul 2010'), '2010-07-16');
		assert.equal(omdbDate('5 Jan 1999'), '1999-01-05');
		assert.equal(omdbDate('N/A'), '');
		assert.equal(omdbDate('2010'), '');
	});
});
