import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { clearCache, setUserAgent } from '../src/core/http';
import { createTitleNote } from '../src/media/create-note';
import type { WatchlistNotesSettings } from '../src/settings';
import { forgetFailures } from '../src/sources';
import { notices } from './support/obsidian';
import { fake, json, resetNetwork } from './support/network';
import { jikanAnswer } from './support/titles';
import { resetUi, ui, userPicks, userSearches } from './support/ui';
import { frontmatter, makeApp, makePlugin, TestApp } from './support/vault';

let app: TestApp;
const plugin = (settings: Partial<WatchlistNotesSettings> = {}) => makePlugin(app, settings);
const FRIEREN_LINK = 'https://myanimelist.net/anime/52991/Sousou_no_Frieren';
const filesIn = (folder: string) => [...app.files.keys()].filter((p) => p.startsWith(`${folder}/`)).sort();

describe('creating an anime note (recorded Tenrai answers)', () => {
	before(() => setUserAgent('WatchlistNotes/test (+https://github.com/BurningBurrito/obsidian-movie-library)'));
	beforeEach(() => {
		clearCache();
		forgetFailures();
		resetNetwork();
		resetUi();
		notices.length = 0;
		app = makeApp();
	});

	it('names the note by the English title, keeps all three titles, and saves the poster', async () => {
		userSearches(FRIEREN_LINK);
		await createTitleNote(plugin(), 'anime');

		const path = "Watch Library/Anime/Frieren Beyond Journey's End.md";
		const p = frontmatter(app, path);
		assert.deepEqual(p.tags, ['🎌Anime']);
		assert.equal(p.title, "Frieren: Beyond Journey's End");
		assert.equal(p.englishTitle, "Frieren: Beyond Journey's End");
		assert.equal(p.romajiTitle, 'Sousou no Frieren');
		assert.equal(p.japaneseTitle, '葬送のフリーレン');
		assert.equal(p.format, 'TV');
		assert.equal(p.year, 2023);
		assert.equal(p.episodes, 28);
		assert.deepEqual(p.studio, ['Madhouse']);
		assert.equal(p.source, 'Tenrai');
		assert.equal(p.sourceUrl, FRIEREN_LINK);
		assert.equal(p.localCover, "[[Watch Library/Posters/Frieren Beyond Journey's End (2023) - mal-52991.jpg]]");
		assert.equal(p.watched, false);
		const poster = new Uint8Array(app.files.get("Watch Library/Posters/Frieren Beyond Journey's End (2023) - mal-52991.jpg") as ArrayBuffer);
		assert.deepEqual([...poster.slice(0, 3)], [0xff, 0xd8, 0xff], 'a real JPEG');

		assert.equal(ui.searchOptions[0]?.title, 'Search for an anime');
		assert.deepEqual(ui.searchOptions[0]?.modes?.map((m) => m.id), ['tenrai', 'jikan'], 'a button for each source');
		assert.equal(ui.searchOptions[0]?.initialMode, 'tenrai');
		assert.equal(ui.pickLists.length, 0, 'a link skips the list');
		assert.deepEqual(app.workspace.opened, [path]);
	});

	it('names notes by the romaji or Japanese title when that’s chosen', async () => {
		userSearches(FRIEREN_LINK);
		await createTitleNote(plugin({ animeTitle: 'japanese' }), 'anime');
		assert.equal(frontmatter(app, 'Watch Library/Anime/葬送のフリーレン.md').title, '葬送のフリーレン');
		assert.ok(app.files.has('Watch Library/Posters/葬送のフリーレン (2023) - mal-52991.jpg'));

		userSearches(FRIEREN_LINK);
		await createTitleNote(plugin({ animeTitle: 'romaji' }), 'anime');
		assert.equal(frontmatter(app, 'Watch Library/Anime/Sousou no Frieren.md').title, 'Sousou no Frieren');
	});

	it('puts anime films in the Anime folder, with a file name Windows accepts', async () => {
		userSearches('your name');
		userPicks(0);
		await createTitleNote(plugin(), 'anime');
		assert.deepEqual(filesIn('Watch Library/Anime'), ['Watch Library/Anime/Your Name.md'], 'no "Your Name..md"');
		const p = frontmatter(app, 'Watch Library/Anime/Your Name.md');
		assert.equal(p.title, 'Your Name.', 'the property keeps the real title');
		assert.equal(p.format, 'Movie');
		assert.deepEqual(filesIn('Watch Library/Posters'), ['Watch Library/Posters/Your Name (2016) - mal-32281.jpg']);
		assert.ok(ui.pickLists[0], 'the results list was shown');
	});

	it('falls back to Jikan when Tenrai is having problems, and says so', async () => {
		fake('api.tenrai.org', json(503, {}));
		fake('api.jikan.moe', json(200, jikanAnswer()));
		fake('cdn.myanimelist.net', { status: 404, text: '' });
		userSearches('frieren');
		await createTitleNote(plugin(), 'anime');
		assert.equal(frontmatter(app, "Watch Library/Anime/Frieren Beyond Journey's End.md").source, 'Jikan');
		assert.ok(notices.includes('Tenrai is having problems (error 503). Try again later.\nShowing results from Jikan instead.'));
	});

	it('says in the results list when another source answered than the one chosen', async () => {
		fake('api.jikan.moe', 'network-error');
		userSearches('your name', 'jikan');
		userPicks(0);
		await createTitleNote(plugin(), 'anime');
		assert.match(ui.pickPlaceholders[0] ?? '', /^\d+ results from Tenrai \(instead of Jikan\)\. Type to filter\.$/);
		assert.ok(notices.includes('Could not reach Jikan. Check your internet connection and try again.\nShowing results from Tenrai instead.'));
		assert.equal(frontmatter(app, 'Watch Library/Anime/Your Name.md').source, 'Tenrai', 'the note says which source answered');
	});

	it('shows Tenrai’s problem in the search window when Jikan is down too', async () => {
		fake('api.tenrai.org', json(504, { message: 'Failed to connect to MyAnimeList' }));
		fake('api.jikan.moe', 'network-error');
		userSearches('frieren');
		await createTitleNote(plugin(), 'anime');
		assert.equal(ui.searchErrors[0], "Tenrai can't reach MyAnimeList right now. Try again later, or search another source.");
		assert.ok(ui.progress.includes('Searching Jikan…'), 'Jikan was tried');
		assert.deepEqual(filesIn('Watch Library/Anime'), []);
	});

	it('says nothing was found, with anime search tips', async () => {
		userSearches('qwxzzvbnmlkj');
		await createTitleNote(plugin({ useFallback: false }), 'anime');
		assert.equal(ui.searchErrors[0], 'No anime found for "qwxzzvbnmlkj". Try fewer words, the romaji title, or the MyAnimeList link.');
	});
});
