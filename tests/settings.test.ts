import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SETTINGS, folderClash, sanitizeSettings } from '../src/settings';

describe('settings', () => {
	it('starts with the agreed defaults', () => {
		assert.deepEqual(sanitizeSettings(null), {
			libraryFolder: 'Watch Library',
			moviesFolder: 'Movies',
			tvFolder: 'TV Shows',
			animeFolder: 'Anime',
			postersFolder: 'Posters',
			libraryNoteName: 'Watch Library MOC',
			openAfterCreate: true,
			animeTitle: 'english',
		});
	});

	it('keeps saved values and repairs ones the settings page would reject', () => {
		const settings = sanitizeSettings({
			libraryFolder: 'Synced Notes/Watch Library',
			tvFolder: 'Series',
			postersFolder: '',
			libraryNoteName: 'Bad|Name',
			animeTitle: 'klingon' as never,
			openAfterCreate: false,
		});
		assert.equal(settings.libraryFolder, 'Synced Notes/Watch Library');
		assert.equal(settings.tvFolder, 'Series');
		assert.equal(settings.postersFolder, DEFAULT_SETTINGS.postersFolder);
		assert.equal(settings.libraryNoteName, DEFAULT_SETTINGS.libraryNoteName);
		assert.equal(settings.animeTitle, 'english');
		assert.equal(settings.openAfterCreate, false);
	});

	it('needs a separate folder for each type and for posters', () => {
		const settings = { ...DEFAULT_SETTINGS };
		assert.equal(folderClash(settings, 'moviesFolder', 'Films'), undefined);
		assert.equal(folderClash(settings, 'moviesFolder', 'Movies'), undefined, 'its own current value');
		assert.match(folderClash(settings, 'animeFolder', 'movies') ?? '', /each need their own folder/, 'same folder, other capitals');
		assert.match(folderClash(settings, 'postersFolder', 'Anime/Posters') ?? '', /each need their own folder/, 'inside another');
		assert.match(folderClash(settings, 'tvFolder', 'Movies/') ?? '', /each need their own folder/, 'trailing slash');
	});
});
