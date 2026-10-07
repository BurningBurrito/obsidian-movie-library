import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import type { WatchlistNotesSettings } from '../src/settings';
import { parseQuery } from '../src/sources';
import { isReadAccessToken, tmdb } from '../src/sources/tmdb';
import { fake, requests, resetNetwork } from './support/network';
import { FAKE_TMDB_API_KEY, FAKE_TMDB_TOKEN, tmdbAnswers } from './support/stand-ins';
import { makeApp, makePlugin } from './support/vault';

const TOKEN = FAKE_TMDB_TOKEN;
const API_KEY = FAKE_TMDB_API_KEY;

function plugin(key: string | null = TOKEN, settings: Partial<WatchlistNotesSettings> = {}) {
	const app = makeApp();
	if (key) app.secretStorage.setSecret('tmdb', key);
	return makePlugin(app, { tmdbKeySecret: key ? 'tmdb' : '', ...settings });
}

describe('TMDB (stand-in answers in its documented format)', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('sends the Read Access Token in a header, never in the address', async () => {
		fake('/search/movie', tmdbAnswers.movieSearch());
		await tmdb.search(parseQuery('inception'), 'movie', plugin());
		const request = requests[0];
		assert.equal(request?.headers.Authorization, `Bearer ${TOKEN}`);
		assert.doesNotMatch(request?.url ?? '', /api_key|eyJ/);
		assert.equal(request?.url, 'https://api.themoviedb.org/3/search/movie?query=inception&include_adult=false&language=en&page=1');
	});

	it('sends the older API key in the address, as TMDB requires for it', async () => {
		fake('/search/movie', tmdbAnswers.movieSearch());
		await tmdb.search(parseQuery('inception'), 'movie', plugin(API_KEY));
		assert.match(requests[0]?.url ?? '', /&api_key=0123456789abcdef0123456789abcdef$/);
		assert.equal(requests[0]?.headers.Authorization, undefined);
		assert.ok(isReadAccessToken(TOKEN) && !isReadAccessToken(API_KEY));
	});

	it('searches movies, with the year and the adult setting passed on', async () => {
		fake('/search/movie', tmdbAnswers.movieSearch());
		const [first, second] = await tmdb.search(parseQuery('Inception (2010)'), 'movie', plugin(TOKEN, { hideAdult: false, language: 'es' }));
		assert.match(requests[0]?.url ?? '', /include_adult=true&language=es&page=1&primary_release_year=2010$/);
		assert.equal(first?.title.title, 'Inception');
		assert.equal(first?.title.year, 2010);
		assert.equal(first?.title.releaseDate, '2010-07-15');
		assert.equal(first?.title.score, 8.37);
		assert.equal(first?.title.posterDownloadUrl, 'https://image.tmdb.org/t/p/w500/test-inception.jpg');
		assert.equal(first?.thumbnailUrl, 'https://image.tmdb.org/t/p/w154/test-inception.jpg');
		assert.equal(first?.title.source.url, 'https://www.themoviedb.org/movie/27205');
		assert.equal(first?.title.source.key, 'tmdb-movie-27205');
		assert.equal(second?.title.posterDownloadUrl, '', 'no poster');
		assert.equal(second?.title.score, null, '0 means no score');
	});

	it('fills in a movie’s director, top-5 cast in billing order, runtime, genres, and IMDb ID', async () => {
		fake('/movie/27205', tmdbAnswers.movieDetails());
		const movie = await tmdb.details({ title: { type: 'movie' } as never, thumbnailUrl: '', ref: { id: '27205', kind: 'movie' } }, plugin());
		assert.match(requests[0]?.url ?? '', /\/movie\/27205\?append_to_response=credits&language=en$/);
		assert.deepEqual(movie.directors, ['Christopher Nolan']);
		assert.deepEqual(movie.cast, ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy', 'Ken Watanabe']);
		assert.equal(movie.runtime, 148);
		assert.deepEqual(movie.genres, ['Action', 'Science fiction']);
		assert.equal(movie.imdbId, 'tt1375666');
		assert.deepEqual(movie.studios, [], 'studios only for anime');
	});

	it('fills in a TV show’s creators, network, seasons, episodes, and IMDb ID', async () => {
		fake('/search/tv', tmdbAnswers.tvSearch());
		fake('/tv/1396', tmdbAnswers.tvDetails());
		const [result] = await tmdb.search(parseQuery('breaking bad'), 'tv', plugin());
		const show = await tmdb.details(result!, plugin());
		assert.match(requests[1]?.url ?? '', /\/tv\/1396\?append_to_response=credits%2Cexternal_ids&language=en$/);
		assert.deepEqual(show.creators, ['Vince Gilligan']);
		assert.equal(show.network, 'AMC');
		assert.equal(show.seasons, 5);
		assert.equal(show.episodes, 62);
		assert.equal(show.firstAired, '2008-01-20');
		assert.equal(show.lastAired, '2013-09-29');
		assert.equal(show.status, 'Ended');
		assert.equal(show.runtime, 45);
		assert.equal(show.imdbId, 'tt0903747');
		assert.equal(show.source.key, 'tmdb-tv-1396');
	});

	it('finds anime among animated series and films, Japanese ones first', async () => {
		fake('/search/tv', tmdbAnswers.animeTvSearch());
		fake('/search/movie', tmdbAnswers.animeMovieSearch());
		const results = await tmdb.search(parseQuery('frieren'), 'anime', plugin());
		assert.deepEqual(results.map((r) => r.title.title), ["Frieren: Beyond Journey's End", 'Your Name.', 'An American Cartoon'], 'animation only; Japanese first');
		const frieren = results[0]!.title;
		assert.equal(frieren.type, 'anime');
		assert.equal(frieren.format, 'TV');
		assert.equal(frieren.englishTitle, "Frieren: Beyond Journey's End");
		assert.equal(frieren.japaneseTitle, '葬送のフリーレン');
		assert.equal(frieren.romajiTitle, '', 'TMDB has no romaji title');
		assert.equal(results[1]?.title.format, 'Movie');
		assert.equal(results[2]?.title.japaneseTitle, '', 'not Japanese: no Japanese title');

		fake('/tv/209867', tmdbAnswers.animeTvDetails());
		const details = await tmdb.details(results[0]!, plugin());
		assert.deepEqual(details.studios, ['Madhouse']);
		assert.equal(details.episodes, 28);
		assert.deepEqual(details.genres, ['Animation', 'Science fiction', 'Fantasy']);
	});

	it('looks up an IMDb ID among films for movies and among series for TV', async () => {
		fake('/find/tt1375666', tmdbAnswers.findMovie());
		assert.deepEqual((await tmdb.search(parseQuery('tt1375666'), 'movie', plugin())).map((r) => r.title.title), ['Inception']);
		assert.match(requests[0]?.url ?? '', /\/find\/tt1375666\?external_source=imdb_id&language=en$/);
		assert.deepEqual(await tmdb.search(parseQuery('tt1375666'), 'tv', plugin()), [], 'a film is not a TV show');
	});

	it('explains a missing or rejected key, and a title TMDB doesn’t have', async () => {
		await assert.rejects(tmdb.search(parseQuery('inception'), 'movie', plugin(null)), /TMDB needs a key\. Add one in Settings → Watchlist Notes → TMDB\./);
		assert.equal(requests.length, 0, 'no request without a key');
		fake('/search/movie', tmdbAnswers.invalidKey());
		await assert.rejects(tmdb.search(parseQuery('inception'), 'movie', plugin()), /TMDB rejected the key\. Check it in Settings → Watchlist Notes → TMDB/);
		fake('/movie/999', tmdbAnswers.notFound());
		await assert.rejects(tmdb.details({ title: { type: 'movie' } as never, thumbnailUrl: '', ref: { id: '999', kind: 'movie' } }, plugin()), /TMDB has no entry for this title/);
	});

	it('checks the key with TMDB’s key check', async () => {
		fake('/authentication', tmdbAnswers.authOk());
		assert.equal(await tmdb.check(plugin()), 'TMDB is working: your key is valid.');
		assert.equal(requests[0]?.url, 'https://api.themoviedb.org/3/authentication');
		fake('/authentication', tmdbAnswers.invalidKey());
		await assert.rejects(tmdb.check(plugin()), /TMDB rejected the key/);
		assert.equal(tmdb.isConfigured(plugin(null)), false);
		assert.equal(tmdb.isConfigured(plugin()), true);
	});
});
