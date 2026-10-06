import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { clearCache, setUserAgent } from '../src/core/http';
import { createTitleNote } from '../src/media/create-note';
import { createTemplateCopies, WatchlistNotesSettings } from '../src/settings';
import { forgetFailures } from '../src/sources';
import { notices } from './support/obsidian';
import { fake, resetNetwork, setOnline } from './support/network';
import { resetUi, ui, userChooses, userPicks, userSearches } from './support/ui';
import { frontmatter, makeApp, makePlugin, TestApp } from './support/vault';

let app: TestApp;
const plugin = (settings: Partial<WatchlistNotesSettings> = {}) => makePlugin(app, settings);
const notesIn = (folder: string) => [...app.files.keys()].filter((p) => p.startsWith(`${folder}/`) && p.endsWith('.md')).sort();
const postersIn = (folder: string) => [...app.files.keys()].filter((p) => p.startsWith(`${folder}/`) && !p.endsWith('.md')).sort();
const SEVERANCE = 'Watch Library/TV Shows/Severance.md';
const SEVERANCE_POSTER = 'Watch Library/Posters/Severance (2022) - tvmaze-44933.jpg';

describe('creating a TV show note (recorded TVmaze answers)', () => {
	before(() => setUserAgent('WatchlistNotes/test (+https://github.com/BurningBurrito/obsidian-movie-library)'));
	beforeEach(() => {
		clearCache();
		forgetFailures();
		resetNetwork();
		resetUi();
		notices.length = 0;
		app = makeApp();
	});

	it('creates the note, saves the poster, creates the library note, and opens the note', async () => {
		userSearches('severance');
		userPicks(0);
		await createTitleNote(plugin(), 'tv');

		const p = frontmatter(app, SEVERANCE);
		assert.deepEqual(p.tags, ['📺TVShow']);
		assert.equal(p.title, 'Severance');
		assert.equal(p.year, 2022);
		assert.equal(p.firstAired, '2022-02-18');
		assert.deepEqual(p.creator, ['Dan Erickson']);
		assert.equal(p.network, 'Apple TV');
		assert.ok(typeof p.seasons === 'number' && typeof p.episodes === 'number');
		assert.equal(p.source, 'TVmaze');
		assert.equal(p.sourceUrl, 'https://www.tvmaze.com/shows/44933/severance');
		assert.equal(p.localCover, `[[${SEVERANCE_POSTER}]]`);
		assert.equal(p.watched, false);
		assert.equal(p.owned, 'N/A');
		assert.deepEqual(p.link, ['[[Watch Library MOC]]']);

		const poster = new Uint8Array(app.files.get(SEVERANCE_POSTER) as ArrayBuffer);
		assert.deepEqual([...poster.slice(0, 3)], [0xff, 0xd8, 0xff], 'a real JPEG');
		assert.ok(poster.byteLength < 100_000, `the medium poster, not the multi-MB original (${poster.byteLength} bytes)`);
		assert.match(app.files.get('Watch Library/Watch Library MOC.md') as string, /FROM "Watch Library\/TV Shows"/);
		assert.deepEqual(app.workspace.opened, [SEVERANCE]);
		assert.equal(ui.searchOptions[0]?.title, 'Search for a TV show');
		assert.ok(ui.progress.includes('Searching TVmaze…'));
		assert.ok((ui.pickLists[0]?.length ?? 0) > 1, 'the results list was shown');
	});

	it('skips the list for an IMDb ID', async () => {
		userSearches('tt11280740');
		await createTitleNote(plugin(), 'tv');
		assert.equal(ui.pickLists.length, 0);
		assert.equal(frontmatter(app, SEVERANCE).title, 'Severance');
	});

	it('asks what to do when the show already has a note; a copy is named by its year', async () => {
		userSearches('severance');
		userPicks(0);
		await createTitleNote(plugin(), 'tv');
		const original = app.files.get(SEVERANCE);

		for (const label of ['Create copy', 'Create copy']) {
			userSearches('severance');
			userPicks(0);
			userChooses(label);
			await createTitleNote(plugin(), 'tv');
		}
		assert.deepEqual(ui.choices[0]?.labels, ['Open existing', 'Create copy', 'Cancel']);
		assert.match(ui.choices[0]?.message ?? '', /"Watch Library\/TV Shows\/Severance\.md" \(2022\) already exists/);
		assert.deepEqual(notesIn('Watch Library/TV Shows'), [
			'Watch Library/TV Shows/Severance (2022).md',
			'Watch Library/TV Shows/Severance 2.md',
			'Watch Library/TV Shows/Severance.md',
		]);
		assert.equal(postersIn('Watch Library/Posters').length, 1, 'the copies reuse the poster');
		assert.equal(app.files.get(SEVERANCE), original, 'original untouched');

		userSearches('severance');
		userPicks(0);
		userChooses('Open existing');
		await createTitleNote(plugin(), 'tv');
		assert.equal(app.workspace.opened.at(-1), SEVERANCE);

		userSearches('severance');
		userPicks(0);
		userChooses('Cancel');
		await createTitleNote(plugin(), 'tv');
		assert.equal(notesIn('Watch Library/TV Shows').length, 3, 'Cancel created nothing');
	});

	it('tells remakes apart: the year in parentheses picks the version, and the second note is named by year', async () => {
		userSearches('The Office (2001)');
		userPicks(0);
		await createTitleNote(plugin(), 'tv');
		assert.equal(frontmatter(app, 'Watch Library/TV Shows/The Office.md').year, 2001);

		userSearches('The Office (2005)');
		userPicks(0);
		userChooses('Create copy');
		await createTitleNote(plugin(), 'tv');
		assert.equal(frontmatter(app, 'Watch Library/TV Shows/The Office (2005).md').year, 2005);
		assert.equal(postersIn('Watch Library/Posters').length, 2, 'each version has its own poster');
	});

	it('creates the note without a poster when there is none or the download fails', async () => {
		fake('static.tvmaze.com', { status: 404, text: '' });
		userSearches('tt11280740');
		await createTitleNote(plugin(), 'tv');
		assert.equal(frontmatter(app, SEVERANCE).localCover, null);
		assert.ok(notices.includes('TVmaze has no poster for "Severance".'));

		app = makeApp();
		fake('static.tvmaze.com', 'network-error');
		userSearches('tt11280740');
		await createTitleNote(plugin(), 'tv');
		assert.equal(frontmatter(app, SEVERANCE).localCover, null);
		assert.ok(notices.some((n) => n.startsWith('Couldn\'t save the poster (Could not reach TVmaze.')));
	});

	it('uses what the search found when the details request fails', async () => {
		fake(/\/shows\/44933\?embed/, 'network-error');
		userSearches('tt11280740');
		await createTitleNote(plugin(), 'tv');
		const p = frontmatter(app, SEVERANCE);
		assert.equal(p.title, 'Severance');
		assert.equal(p.creator, null, 'creators come with the details');
		assert.ok(notices.some((n) => n.startsWith("Couldn't get all the details from TVmaze")));
	});

	it('uses a custom template, and the built-in one when the template file is missing', async () => {
		app.vault.put('Templates/My show.md', '---\nshow: {{title}}\nwhere: {{network}}\n---\n{{description}}\n');
		userSearches('tt11280740');
		await createTitleNote(plugin({ tvTemplate: 'Templates/My show' }), 'tv');
		assert.deepEqual(frontmatter(app, SEVERANCE), { show: 'Severance', where: 'Apple TV' });

		app = makeApp();
		userSearches('tt11280740');
		await createTitleNote(plugin({ tvTemplate: 'Templates/Gone.md' }), 'tv');
		assert.equal(frontmatter(app, SEVERANCE).network, 'Apple TV');
		assert.ok(notices.includes('Template "Templates/Gone.md" was not found, so the built-in template was used.'));
	});

	it('works in a nested library folder and uses an existing library note whose name differs in capitals', async () => {
		const moc = 'Synced Notes/Watch Library/Watch library MOC.md';
		app.vault.put(moc, '# My own library note\n');
		userSearches('tt11280740');
		await createTitleNote(plugin({ libraryFolder: 'Synced Notes/Watch Library' }), 'tv');
		const p = frontmatter(app, 'Synced Notes/Watch Library/TV Shows/Severance.md');
		assert.deepEqual(p.link, ['[[Watch library MOC]]']);
		assert.equal(p.localCover, '[[Synced Notes/Watch Library/Posters/Severance (2022) - tvmaze-44933.jpg]]');
		assert.equal(app.files.get(moc), '# My own library note\n', 'never changed');
		assert.equal(app.vault.getFileByPath('Synced Notes/Watch Library/Watch Library MOC.md'), null, 'no second library note');
	});

	it('shows search problems in the window: offline, nothing found', async () => {
		setOnline(false);
		userSearches('severance');
		await createTitleNote(plugin(), 'tv');
		assert.match(ui.searchErrors[0] ?? '', /You appear to be offline/);

		setOnline(true);
		userSearches('qwxzzvbnmlkj');
		await createTitleNote(plugin(), 'tv');
		assert.equal(ui.searchErrors[1], 'No TV shows found for "qwxzzvbnmlkj". Try fewer words, or the IMDb ID.');
		assert.equal(notesIn('Watch Library/TV Shows').length, 0);
	});

	it('explains that movie search needs a key, instead of opening a search', async () => {
		await createTitleNote(plugin(), 'movie');
		assert.equal(ui.searchOptions.length, 0, 'no search window');
		assert.equal(ui.choices[0]?.title, 'Movie search needs a key');
		assert.match(ui.choices[0]?.message ?? '', /needs a free TMDB or OMDb API key[\s\S]*TV shows and anime work without a key/);
		assert.deepEqual(ui.choices[0]?.labels, ['How to get a key', 'Close'], 'no settings button where Obsidian can’t open settings');

		const opened: string[] = [];
		(app as unknown as { setting: unknown }).setting = { open: () => undefined, openTabById: (id: string) => opened.push(id) };
		userChooses('Open settings');
		await createTitleNote(plugin(), 'movie');
		assert.deepEqual(ui.choices[1]?.labels, ['Open settings', 'How to get a key', 'Close']);
		assert.deepEqual(opened, ['watchlist-notes']);
	});

	it('creates editable templates, keeping one that exists, and selects them', async () => {
		app.vault.put('Templates/TV show note.md', 'my own');
		const p = plugin();
		const message = await createTemplateCopies(p);
		assert.equal(app.files.get('Templates/TV show note.md'), 'my own');
		assert.match(app.files.get('Templates/Movie note.md') as string, /^---\ntags:\n {2}- 🎬Movie\n/);
		assert.match(app.files.get('Templates/Anime note.md') as string, /romajiTitle: \{\{romajiTitle\}\}/);
		assert.deepEqual([p.settings.movieTemplate, p.settings.tvTemplate, p.settings.animeTemplate], [
			'Templates/Movie note.md',
			'Templates/TV show note.md',
			'Templates/Anime note.md',
		]);
		assert.match(message, /Created "Templates\/Movie note\.md", "Templates\/Anime note\.md"\. .*"Templates\/TV show note\.md" already existed and is now used\./);
	});
});
