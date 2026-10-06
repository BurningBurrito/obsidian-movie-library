import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { TFile } from 'obsidian';
import {
	applyRegeneration,
	ensureLibraryNote,
	generatedBlock,
	newLibraryNote,
	planRegeneration,
	regenerateLibraryNote,
	tableQuery,
} from '../src/library/moc';
import { isWatchNote, toggleWatched } from '../src/library/watched-status';
import { DEFAULT_SETTINGS, WatchlistNotesSettings } from '../src/settings';
import { notices } from './support/obsidian';
import { resetUi, ui, userChooses } from './support/ui';
import { frontmatter, makeApp, makePlugin } from './support/vault';

// A library note made by hand: a banner, tags, and one Dataview table that
// Watchlist Notes didn't create.
const HAND_MADE = `---
tags:
  - 🎬Movie
banner: "![[WatchBanner.jpg]]"
---

\`\`\`dataview
table title as title, localCover as poster
FROM "Synced Notes/Watch Library/Movies"
\`\`\`
`;

// Library Notes' generated block, as it appears in a vault that has both plugins.
const LIBRARY_NOTES_BLOCK = '%% library-notes:start (generated) %%\n```dataview\nTABLE WITHOUT ID\nFROM "Library/Books"\n```\n%% library-notes:end %%';

const nested: Partial<WatchlistNotesSettings> = { libraryFolder: 'Synced Notes/Watch Library', libraryNoteName: 'Watch library MOC' };
const settings = (overrides: Partial<WatchlistNotesSettings> = {}) => ({ ...DEFAULT_SETTINGS, ...overrides });

describe('library tables', () => {
	it('reads each type’s folder from the settings, quoted safely', () => {
		assert.match(tableQuery('movie', 'Synced Notes/Watch Library/Films', 'english'), /^FROM "Synced Notes\/Watch Library\/Films"$/m);
		assert.match(tableQuery('tv', 'Odd "quotes"\\folder', 'english'), /^FROM "Odd \\"quotes\\"\\\\folder"$/m);
	});

	it('has the agreed columns for each type, with the poster column that accepts every image form', () => {
		const common = ['AS Poster', 'AS Title', 'year AS Year', 'genre AS Genre', 'file.link AS Note', 'choice(watched, "🟩", "🟥") AS Watched'];
		const own = { movie: ['director AS Director'], tv: ['creator AS Creator'], anime: ['format AS Format', 'studio AS Studio'] } as const;
		for (const type of ['movie', 'tv', 'anime'] as const) {
			const query = tableQuery(type, 'X', 'english');
			for (const column of [...common, ...own[type]]) assert.ok(query.includes(column), `${type}: ${column}`);
			assert.ok(query.includes(String.raw`regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", "")`));
		}
		assert.ok(!tableQuery('movie', 'X', 'english').includes('Studio'));
	});

	it('titles anime by the chosen title, falling back to `title` and the file name, and sorts the same way', () => {
		for (const [choice, property] of [['english', 'englishTitle'], ['romaji', 'romajiTitle'], ['japanese', 'japaneseTitle']] as const) {
			const query = tableQuery('anime', 'X', choice);
			assert.ok(query.includes(`default(${property}, default(title, file.name)) AS Title`), choice);
			assert.ok(query.includes(`SORT default(${property}, default(title, file.name)) ASC`), choice);
		}
		assert.ok(tableQuery('movie', 'X', 'japanese').includes('default(title, file.name) AS Title'), 'other types ignore the setting');
	});

	it('creates a full-width note with three headed tables between markers', () => {
		const note = newLibraryNote(settings());
		assert.match(note, /^---\ncssclasses:\n {2}- watchlist-notes-moc\n---\n# Watch Library\n/);
		assert.deepEqual([...note.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['Movies', 'TV shows', 'Anime']);
		assert.deepEqual([...note.matchAll(/^FROM "(.+)"$/gm)].map((m) => m[1]), ['Watch Library/Movies', 'Watch Library/TV Shows', 'Watch Library/Anime']);
		assert.equal(planRegeneration(note).kind, 'markers');
	});

	it('shares no markers or classes with Library Notes', () => {
		const note = newLibraryNote(settings());
		assert.doesNotMatch(note, /library-notes/);
		assert.notEqual(planRegeneration(LIBRARY_NOTES_BLOCK).kind, 'markers', 'Library Notes’ markers are not ours');
	});
});

describe('regenerating', () => {
	it('replaces only the marked part', () => {
		const note = `# My shows\n\nIntro text.\n\n${generatedBlock(settings({ tvFolder: 'Old' }))}\n\nNotes below.\n`;
		const updated = applyRegeneration(note, planRegeneration(note), generatedBlock(settings({ tvFolder: 'Series' })), false);
		assert.match(updated, /FROM "Watch Library\/Series"/);
		assert.doesNotMatch(updated, /Watch Library\/Old/);
		assert.match(updated, /^Intro text\.$/m);
		assert.match(updated, /^Notes below\.$/m);
	});

	it('finds a single hand-made table, and can replace it or add below it', () => {
		const plan = planRegeneration(HAND_MADE);
		assert.equal(plan.kind, 'single-table');
		const replaced = applyRegeneration(HAND_MADE, plan, generatedBlock(settings(nested)), true);
		assert.doesNotMatch(replaced, /localCover as poster/);
		assert.match(replaced, /banner: "!\[\[WatchBanner\.jpg\]\]"/);
		assert.equal(planRegeneration(replaced).kind, 'markers', 'later runs find the markers');
		const added = applyRegeneration(HAND_MADE, plan, generatedBlock(settings()), false);
		assert.match(added, /localCover as poster/);
		assert.match(added, /watchlist-notes:start/);
	});

	it('adds at the end when there are several tables, only dataviewjs, or Library Notes’ block', () => {
		assert.equal(planRegeneration(`${HAND_MADE}\n\`\`\`dataview\nlist\n\`\`\`\n`).kind, 'append');
		assert.equal(planRegeneration('```dataviewjs\ndv.list([])\n```\n').kind, 'append');
		assert.equal(planRegeneration('%% watchlist-notes:start (half a marker) %%\n').kind, 'append');
		assert.equal(planRegeneration(`${LIBRARY_NOTES_BLOCK}\n\n\`\`\`dataview\nlist\n\`\`\`\n`).kind, 'append');
	});
});

describe('library note in the vault', () => {
	beforeEach(() => {
		resetUi();
		notices.length = 0;
	});

	it('is created once, and an existing one is never changed', async () => {
		const app = makeApp();
		const plugin = makePlugin(app);
		await ensureLibraryNote(plugin);
		assert.match(app.files.get('Watch Library/Watch Library MOC.md') as string, /FROM "Watch Library\/Movies"/);
		app.files.set('Watch Library/Watch Library MOC.md', 'My own text');
		await ensureLibraryNote(plugin);
		assert.equal(app.files.get('Watch Library/Watch Library MOC.md'), 'My own text');
	});

	it('uses a note whose name differs only in capital letters, instead of creating a second one', async () => {
		const app = makeApp();
		app.vault.put('Synced Notes/Watch Library/Watch library MOC.md', HAND_MADE);
		const plugin = makePlugin(app, { ...nested, libraryNoteName: 'Watch Library MOC' });
		const file = await ensureLibraryNote(plugin);
		assert.equal(file.path, 'Synced Notes/Watch Library/Watch library MOC.md');
		assert.equal(app.vault.getFileByPath('Synced Notes/Watch Library/Watch Library MOC.md'), null);
		assert.ok(notices.some((n) => n.includes('differs from the setting "Watch Library MOC" only in capital letters')));
	});

	it('leaves Library Notes’ library note alone when both use the same folder', async () => {
		const app = makeApp();
		const books = `---\ncssclasses:\n  - library-notes-moc\n---\n# Library\n\n${LIBRARY_NOTES_BLOCK}\n`;
		app.vault.put('Library/Library MOC.md', books);
		await ensureLibraryNote(makePlugin(app, { libraryFolder: 'Library' }));
		assert.equal(app.files.get('Library/Library MOC.md'), books);
		assert.match(app.files.get('Library/Watch Library MOC.md') as string, /watchlist-notes:start/);
	});

	it('regenerates a hand-made note after asking: replace the table, keep the rest, make it full width', async () => {
		const app = makeApp();
		app.vault.put('Synced Notes/Watch Library/Watch library MOC.md', HAND_MADE);
		const plugin = makePlugin(app, nested);
		userChooses('Replace that table');
		await regenerateLibraryNote(plugin);
		assert.deepEqual(ui.choices[0]?.labels, ['Replace that table', 'Add at the end', 'Cancel']);
		const text = app.files.get('Synced Notes/Watch Library/Watch library MOC.md') as string;
		assert.doesNotMatch(text, /localCover as poster/);
		assert.match(text, /FROM "Synced Notes\/Watch Library\/Anime"/);
		const props = frontmatter(app, 'Synced Notes/Watch Library/Watch library MOC.md');
		assert.deepEqual(props.cssclasses, ['watchlist-notes-moc']);
		assert.equal(props.banner, '![[WatchBanner.jpg]]');
		assert.deepEqual(props.tags, ['🎬Movie']);

		// Again: now it has markers, so it's a plain "Regenerate"; Cancel changes nothing.
		userChooses(null);
		await regenerateLibraryNote(plugin);
		assert.deepEqual(ui.choices[1]?.labels, ['Regenerate', 'Cancel']);
		assert.equal(app.files.get('Synced Notes/Watch Library/Watch library MOC.md'), text, 'Cancel changed nothing');
	});

	it('picks up a changed anime title setting when regenerating', async () => {
		const app = makeApp();
		await ensureLibraryNote(makePlugin(app));
		userChooses('Regenerate');
		await regenerateLibraryNote(makePlugin(app, { animeTitle: 'romaji' }));
		const text = app.files.get('Watch Library/Watch Library MOC.md') as string;
		assert.match(text, /default\(romajiTitle, default\(title, file\.name\)\) AS Title/);
		assert.doesNotMatch(text, /englishTitle/);
	});

	it('keeps existing cssclasses when adding the full-width class', async () => {
		const app = makeApp();
		app.vault.put('Watch Library/Watch Library MOC.md', '---\ncssclasses: wide\n---\nNo tables yet.\n');
		userChooses('Add the tables');
		await regenerateLibraryNote(makePlugin(app));
		assert.deepEqual(frontmatter(app, 'Watch Library/Watch Library MOC.md').cssclasses, ['wide', 'watchlist-notes-moc']);
		assert.match(app.files.get('Watch Library/Watch Library MOC.md') as string, /No tables yet\.\n\n%% watchlist-notes:start/);
	});

	it('says when Dataview is missing or turned off', async () => {
		for (const [installed, enabled, expected] of [
			[false, false, /needs the Dataview plugin\. Install it/],
			[true, false, /installed but turned off/],
		] as const) {
			const app = makeApp();
			app.plugins.enabledPlugins = new Set(enabled ? ['dataview'] : []);
			app.plugins.manifests = installed ? { dataview: {} } : {};
			notices.length = 0;
			await ensureLibraryNote(makePlugin(app));
			assert.ok(notices.some((n) => expected.test(n)), String(expected));
		}
		const app = makeApp();
		notices.length = 0;
		await ensureLibraryNote(makePlugin(app));
		assert.ok(!notices.some((n) => /Dataview/.test(n)), 'no warning when Dataview is enabled');
	});
});

describe('watched status', () => {
	it('works on notes in the movies, TV shows, and anime folders (and their subfolders) only', () => {
		const app = makeApp();
		const s = settings();
		const movie = app.vault.put('Watch Library/Movies/Dune.md', '');
		const show = app.vault.put('Watch Library/TV Shows/Severance.md', '');
		const anime = app.vault.put('Watch Library/Anime/Films/Your Name.md', '');
		const moc = app.vault.put('Watch Library/Watch Library MOC.md', '');
		const book = app.vault.put('Library/Books/Dune.md', '');
		const poster = app.vault.put('Watch Library/Movies/poster.jpg', new ArrayBuffer(1));
		for (const file of [movie, show, anime]) assert.ok(isWatchNote(file as unknown as TFile, s), file.path);
		for (const file of [moc, book, poster]) assert.ok(!isWatchNote(file as unknown as TFile, s), file.path);
		assert.ok(!isWatchNote(null, s));
	});

	it('flips watched (missing counts as unwatched) and leaves other properties alone', async () => {
		const app = makeApp();
		const file = app.vault.put('Watch Library/Movies/Inception.md', '---\ntitle: Inception\nrating: 9\nread: true\n---\nMy notes.\n') as unknown as TFile;
		assert.equal(await toggleWatched(app as never, file), true);
		assert.equal(frontmatter(app, file.path).watched, true);
		assert.equal(await toggleWatched(app as never, file), false);
		assert.deepEqual(frontmatter(app, file.path), { title: 'Inception', rating: 9, read: true, watched: false });
		assert.match(app.files.get(file.path) as string, /My notes\.\n$/);
	});
});
