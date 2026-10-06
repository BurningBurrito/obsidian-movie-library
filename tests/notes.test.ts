import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureFolder, findNoteByName, nameKey, nextFreePath, safeFileName } from '../src/core/notes';
import { isInFolder, libraryPaths } from '../src/core/paths';
import { DEFAULT_SETTINGS } from '../src/settings';
import { makeApp } from './support/vault';
import type { App } from 'obsidian';

describe('file names', () => {
	it('removes characters that break files or links, and uses straight apostrophes', () => {
		assert.equal(safeFileName('Frieren: Beyond Journey’s End', 'x'), "Frieren Beyond Journey's End");
		assert.equal(safeFileName('AC/DC: [Live] #1 | “Best”?', 'x'), 'AC DC Live 1 Best');
		assert.equal(safeFileName('  ...  ', 'Untitled'), 'Untitled');
		assert.equal(safeFileName('a'.repeat(200), 'x', 80).length, 80);
		assert.equal(safeFileName('Your Name.', 'x'), 'Your Name', 'no dot at the end (Windows)');
		assert.equal(safeFileName('K-On!! ...', 'x'), 'K-On!!');
		assert.equal(safeFileName('Mr. Robot', 'x'), 'Mr. Robot', 'dots inside are fine');
	});

	it('treats small differences as the same name', () => {
		assert.equal(nameKey('Frieren: Beyond Journey’s  End'), nameKey("frieren: beyond journey's end"));
		assert.equal(nameKey('Spider-Man – Into the Spider–Verse'), nameKey('Spider-Man - Into the Spider-Verse'));
		assert.notEqual(nameKey('Dune'), nameKey('Dune: Part Two'));
	});
});

describe('finding notes', () => {
	const app = makeApp();
	app.vault.put("Watch Library/Anime/Frieren Beyond Journey's End.md", '');
	app.vault.put('Watch Library/Movies/Sci-fi/Dune.md', '');
	app.vault.put('Watch Library/Watch library MOC.md', '');
	app.vault.put('Elsewhere/Dune.md', '');
	const vaultApp = app as unknown as App;

	it('finds a note by exact name, by small differences, and in subfolders', () => {
		assert.equal(findNoteByName(vaultApp, 'Watch Library/Anime', 'Frieren Beyond Journey’s End', true)?.path, "Watch Library/Anime/Frieren Beyond Journey's End.md");
		assert.equal(findNoteByName(vaultApp, 'Watch Library/Movies', 'dune', true)?.path, 'Watch Library/Movies/Sci-fi/Dune.md');
		assert.equal(findNoteByName(vaultApp, 'Watch Library', 'Watch Library MOC', false)?.path, 'Watch Library/Watch library MOC.md');
	});

	it('stays inside the folder', () => {
		assert.equal(findNoteByName(vaultApp, 'Watch Library/Movies', 'Dune', false), null);
		assert.equal(findNoteByName(vaultApp, 'Watch Library/TV Shows', 'Dune', true), null);
	});

	it('numbers copies', () => {
		app.vault.put('Watch Library/Movies/Dune.md', '');
		app.vault.put('Watch Library/Movies/Dune 2.md', '');
		assert.equal(nextFreePath(vaultApp, 'Watch Library/Movies', 'Dune'), 'Watch Library/Movies/Dune 3.md');
	});
});

describe('folders', () => {
	it('creates nested folders one level at a time and keeps existing ones', async () => {
		const app = makeApp();
		app.vault.mkdirs('Synced Notes');
		await ensureFolder(app as unknown as App, 'Synced Notes/Watch Library/Movies');
		assert.ok(app.vault.getFolderByPath('Synced Notes/Watch Library/Movies'));
		await ensureFolder(app as unknown as App, 'Synced Notes/Watch Library/Movies'); // again: no error
	});

	it('explains when a file is in the way', async () => {
		const app = makeApp();
		app.vault.put('Watch Library', 'a file, not a folder');
		await assert.rejects(ensureFolder(app as unknown as App, 'Watch Library/Movies'), /"Watch Library" is a file, not a folder/);
	});

	it('builds the library paths from the settings, also for a nested or root library folder', () => {
		const nested = libraryPaths({ ...DEFAULT_SETTINGS, libraryFolder: 'Synced Notes/Watch Library/', tvFolder: 'Series', libraryNoteName: 'Watch library MOC' });
		assert.deepEqual(nested, {
			root: 'Synced Notes/Watch Library',
			folders: {
				movie: 'Synced Notes/Watch Library/Movies',
				tv: 'Synced Notes/Watch Library/Series',
				anime: 'Synced Notes/Watch Library/Anime',
			},
			posters: 'Synced Notes/Watch Library/Posters',
			libraryNoteName: 'Watch library MOC',
			libraryNote: 'Synced Notes/Watch Library/Watch library MOC.md',
		});
		const root = libraryPaths({ ...DEFAULT_SETTINGS, libraryFolder: '/' });
		assert.equal(root.folders.movie, 'Movies');
		assert.equal(root.libraryNote, 'Watch Library MOC.md');
		assert.ok(isInFolder('Watch Library/Movies/Sci-fi/Dune.md', 'Watch Library/Movies'));
		assert.ok(!isInFolder('Watch Library/Movies Extra/Dune.md', 'Watch Library/Movies'));
	});
});
