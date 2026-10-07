import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import { createTitleNote } from '../src/media/create-note';
import type { WatchlistNotesSettings } from '../src/settings';
import { forgetFailures } from '../src/sources';
import { notices } from './support/obsidian';
import { fake, json, requests, resetNetwork } from './support/network';
import { omdbAnswers, POSTER, tmdbAnswers } from './support/stand-ins';
import { resetUi, ui, userPicks, userSearches } from './support/ui';
import { frontmatter, makeApp, makePlugin, TestApp } from './support/vault';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdC1zaWduYXR1cmU';
let app: TestApp;
function plugin(keys: { tmdb?: boolean; omdb?: boolean } = { tmdb: true }, settings: Partial<WatchlistNotesSettings> = {}) {
	if (keys.tmdb) app.secretStorage.setSecret('tmdb', TOKEN);
	if (keys.omdb) app.secretStorage.setSecret('omdb', 'abc12345');
	return makePlugin(app, { tmdbKeySecret: keys.tmdb ? 'tmdb' : '', omdbKeySecret: keys.omdb ? 'omdb' : '', ...settings });
}

describe('creating movie notes, and TMDB as a backup (stand-in answers)', () => {
	beforeEach(() => {
		clearCache();
		forgetFailures();
		resetNetwork();
		resetUi();
		notices.length = 0;
		app = makeApp();
		fake('image.tmdb.org', POSTER);
		fake('m.media-amazon.com', POSTER);
	});

	it('creates a movie note from TMDB, with its poster and the movie template', async () => {
		fake('/search/movie', tmdbAnswers.movieSearch());
		fake('/movie/27205', tmdbAnswers.movieDetails());
		userSearches('inception');
		userPicks(0);
		await createTitleNote(plugin(), 'movie');

		const p = frontmatter(app, 'Watch Library/Movies/Inception.md');
		assert.deepEqual(p.tags, ['🎬Movie']);
		assert.equal(p.title, 'Inception');
		assert.equal(p.originalTitle, null);
		assert.equal(p.year, 2010);
		assert.equal(p.releaseDate, '2010-07-15');
		assert.deepEqual(p.director, ['Christopher Nolan']);
		assert.equal((p.cast as string[]).length, 5);
		assert.equal(p.runtime, 148);
		assert.equal(p.score, 8.37);
		assert.equal(p.source, 'TMDB');
		assert.equal(p.sourceUrl, 'https://www.themoviedb.org/movie/27205');
		assert.equal(p.localCover, '[[Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg]]');
		assert.ok(app.files.has('Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg'));
		assert.equal(ui.searchOptions[0]?.title, 'Search for a movie');
		assert.deepEqual(ui.searchOptions[0]?.modes?.map((m) => m.id), ['tmdb']);
		assert.ok(requests.every((r) => !r.url.includes(TOKEN)), 'the token never appears in an address');
	});

	it('offers both movie sources once both keys are set, and falls back to OMDb', async () => {
		fake('/search/movie', tmdbAnswers.invalidKey());
		fake('s=inception', omdbAnswers.search());
		fake('i=tt1375666', omdbAnswers.movie());
		userSearches('inception');
		userPicks(0);
		await createTitleNote(plugin({ tmdb: true, omdb: true }), 'movie');
		assert.deepEqual(ui.searchOptions[0]?.modes?.map((m) => m.id), ['tmdb', 'omdb']);
		const p = frontmatter(app, 'Watch Library/Movies/Inception.md');
		assert.equal(p.source, 'OMDb');
		assert.equal(p.releaseDate, '2010-07-16');
		assert.equal(p.localCover, '[[Watch Library/Posters/Inception (2010) - imdb-tt1375666.jpg]]');
		assert.ok(notices.some((n) => n.startsWith('TMDB rejected the key.') && n.endsWith('Showing results from OMDb instead.')));
		assert.match(ui.pickPlaceholders[0] ?? '', /from OMDb \(instead of TMDB\)/);
	});

	it('shows OMDb’s daily limit in the search window when it’s the only movie source', async () => {
		fake('s=inception', omdbAnswers.error('Request limit reached!', 401));
		userSearches('inception');
		await createTitleNote(plugin({ omdb: true }), 'movie');
		assert.equal(ui.searchErrors[0], "Your OMDb key has used up today's 1,000 requests. Try again tomorrow, or search another source.");
	});

	it('uses TMDB when TVmaze is having problems', async () => {
		fake('api.tvmaze.com', json(503, {}));
		fake('/search/tv', tmdbAnswers.tvSearch());
		fake('/tv/1396', tmdbAnswers.tvDetails());
		userSearches('breaking bad');
		await createTitleNote(plugin(), 'tv');
		const p = frontmatter(app, 'Watch Library/TV Shows/Breaking Bad.md');
		assert.equal(p.source, 'TMDB');
		assert.deepEqual(p.creator, ['Vince Gilligan']);
		assert.equal(p.network, 'AMC');
		assert.equal(p.seasons, 5);
		assert.ok(notices.includes('TVmaze is having problems (error 503). Try again later.\nShowing results from TMDB instead.'));
	});

	it('uses TMDB for anime when Tenrai and Jikan can’t be reached', async () => {
		fake('api.tenrai.org', 'network-error');
		fake('api.jikan.moe', 'network-error');
		fake('/search/tv', tmdbAnswers.animeTvSearch());
		fake('/search/movie', tmdbAnswers.animeMovieSearch());
		fake('/tv/209867', tmdbAnswers.animeTvDetails());
		userSearches('frieren');
		userPicks(0);
		await createTitleNote(plugin(), 'anime');
		const p = frontmatter(app, "Watch Library/Anime/Frieren Beyond Journey's End.md");
		assert.equal(p.source, 'TMDB');
		assert.equal(p.format, 'TV');
		assert.equal(p.japaneseTitle, '葬送のフリーレン');
		assert.equal(p.romajiTitle, null, 'TMDB has none');
		assert.deepEqual(p.studio, ['Madhouse']);
		assert.ok(app.files.has("Watch Library/Posters/Frieren Beyond Journey's End (2023) - tmdb-tv-209867.jpg"));
	});
});
