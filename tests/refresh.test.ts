import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import { localDate } from '../src/core/utils';
import { findTmdbNotes, isDue, refreshStatus, refreshTmdbNotes, remindIfDue, resetReminder } from '../src/library/tmdb-refresh';
import { notices } from './support/obsidian';
import { fake, json, requests, resetNetwork } from './support/network';
import { FAKE_TMDB_TOKEN, POSTER, tmdbAnswers } from './support/stand-ins';
import { resetUi, ui, userChooses } from './support/ui';
import { frontmatter, makeApp, makePlugin, TestApp } from './support/vault';

const TOKEN = FAKE_TMDB_TOKEN;
const NOTE = 'Watch Library/Movies/Inception.md';
const POSTER_PATH = 'Watch Library/Posters/Inception (2010) - tmdb-movie-27205.jpg';
const OLD_POSTER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(2048).fill(1)]).buffer;
const today = localDate(new Date());

/** A movie note as the built-in template makes it from TMDB, with some of the user's own changes. */
function movieNote(dates: string, localCover = POSTER_PATH, extra = 'runtime: 100\n') {
	return `---
tags:
  - 🎬Movie
title: Inception
originalTitle:
year: 2010
director:
  - Old Director
cast:
  - Old Actor
genre:
  - Old genre
${extra}score: 7
description: Old description.
cover: https://image.tmdb.org/t/p/w500/old.jpg
localCover: "[[${localCover}]]"
watched: true
rating: 9
owned: 🟩
streaming: Netflix
source: TMDB
sourceUrl: https://www.themoviedb.org/movie/27205
${dates}
myOwn: keep me
link:
  - "[[Watch Library MOC]]"
---
# Summary:
My own notes.
`;
}

let app: TestApp;
const plugin = (withKey = true) => {
	if (withKey) app.secretStorage.setSecret('tmdb', TOKEN);
	return makePlugin(app, { tmdbKeySecret: withKey ? 'tmdb' : '' });
};

describe('Refresh TMDB notes (stand-in answers)', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
		resetUi();
		resetReminder();
		notices.length = 0;
		app = makeApp();
		fake('/movie/27205', tmdbAnswers.movieDetails());
		fake('image.tmdb.org', POSTER);
	});

	it('finds notes from TMDB in all three folders, by their TMDB address', () => {
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"'));
		app.vault.put('Watch Library/TV Shows/Breaking Bad.md', '---\nsourceUrl: https://www.themoviedb.org/tv/1396\nsourceUpdated: 2026-09-01\n---\n');
		app.vault.put("Watch Library/Anime/Sub/Frieren.md", '---\nsourceUrl: https://www.themoviedb.org/tv/209867-frieren\n---\n');
		app.vault.put('Watch Library/TV Shows/Severance.md', '---\nsource: TVmaze\nsourceUrl: https://www.tvmaze.com/shows/44933\n---\n');
		app.vault.put('Watch Library/Movies/Hand made.md', '---\nsource: TMDB\n---\n');
		app.vault.put('Elsewhere/Dune.md', '---\nsourceUrl: https://www.themoviedb.org/movie/438631\n---\n');
		const { notes, withoutAddress } = findTmdbNotes(plugin());
		assert.deepEqual(
			notes.map((n) => [n.file.basename, n.type, n.kind, n.id]).sort(),
			[['Breaking Bad', 'tv', 'tv', '1396'], ['Frieren', 'anime', 'tv', '209867'], ['Inception', 'movie', 'movie', '27205']],
		);
		assert.deepEqual(withoutAddress.map((f) => f.basename), ['Hand made']);
	});

	it('counts a note as due 5 months after its last update', () => {
		const now = new Date(2026, 9, 7);
		const note = (updated: Date) => ({ updated }) as never;
		assert.ok(isDue(note(new Date(2026, 4, 6)), now), '5 months and a day');
		assert.ok(!isDue(note(new Date(2026, 4, 8)), now), 'just under 5 months');
		app.vault.put(NOTE, movieNote(`sourceUpdated: ${today}\ncreated: "2020-01-01 10:00:00"`));
		assert.equal(findTmdbNotes(plugin()).notes[0]?.updated.getFullYear(), new Date().getFullYear(), 'sourceUpdated wins over created');
	});

	it('refreshes a due note: TMDB properties and the poster file, and nothing of the user’s', async () => {
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"'));
		app.vault.put(POSTER_PATH, OLD_POSTER);
		userChooses('Refresh 1 due');
		await refreshTmdbNotes(plugin());

		assert.deepEqual(ui.choices[0]?.labels, ['Refresh 1 due', 'Refresh all 1', 'Cancel']);
		assert.match(ui.choices[0]?.message ?? '', /up to 6 months[\s\S]*Nothing is deleted\./);
		const p = frontmatter(app, NOTE);
		assert.deepEqual(p.director, ['Christopher Nolan']);
		assert.equal((p.cast as string[]).length, 5);
		assert.deepEqual(p.genre, ['Action', 'Science fiction']);
		assert.equal(p.runtime, 148);
		assert.equal(p.score, 8.37);
		assert.equal(p.cover, 'https://image.tmdb.org/t/p/w500/test-inception.jpg');
		assert.equal(p.sourceUpdated, today);
		// The user's things are untouched.
		assert.equal(p.title, 'Inception');
		assert.equal(p.watched, true);
		assert.equal(p.rating, 9);
		assert.equal(p.owned, '🟩');
		assert.equal(p.streaming, 'Netflix');
		assert.equal(p.myOwn, 'keep me');
		assert.equal(p.created, '2025-01-01 10:00:00');
		assert.deepEqual(p.tags, ['🎬Movie']);
		assert.deepEqual(p.link, ['[[Watch Library MOC]]']);
		assert.equal(p.localCover, `[[${POSTER_PATH}]]`);
		assert.match(app.files.get(NOTE) as string, /# Summary:\nMy own notes\.\n$/);
		// The poster file was replaced in place.
		assert.equal((app.files.get(POSTER_PATH) as ArrayBuffer).byteLength, Buffer.from(POSTER.base64, 'base64').byteLength);
		assert.equal([...app.files.keys()].filter((k) => k.startsWith('Watch Library/Posters/')).length, 1);
		assert.ok(notices.includes('Refreshed 1 note from TMDB.'));
	});

	it('only updates properties the note has', async () => {
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"', POSTER_PATH, ''));
		app.vault.put(POSTER_PATH, OLD_POSTER);
		userChooses('Refresh 1 due');
		await refreshTmdbNotes(plugin());
		assert.ok(!('runtime' in frontmatter(app, NOTE)), 'no runtime property added');
		assert.ok(!('releaseDate' in frontmatter(app, NOTE)));
	});

	it('offers "Refresh all" when none are due, and Cancel changes nothing', async () => {
		const text = movieNote(`sourceUpdated: ${today}`);
		app.vault.put(NOTE, text);
		userChooses(null);
		await refreshTmdbNotes(plugin());
		assert.deepEqual(ui.choices[0]?.labels, ['Refresh all 1', 'Cancel']);
		assert.equal(app.files.get(NOTE), text);
		assert.equal(requests.length, 0);
	});

	it('leaves a title TMDB no longer has as it is, and says so', async () => {
		fake('/movie/27205', tmdbAnswers.notFound());
		const text = movieNote('created: "2025-01-01 10:00:00"');
		app.vault.put(NOTE, text);
		userChooses('Refresh 1 due');
		await refreshTmdbNotes(plugin());
		assert.equal(app.files.get(NOTE), text);
		assert.ok(notices.includes('Refreshed 0 notes from TMDB.\nNo longer on TMDB (left as they are): Inception.'));
	});

	it('keeps the old poster when TMDB has none, and saves a new one when the note’s poster is elsewhere', async () => {
		const details = JSON.parse(tmdbAnswers.movieDetails().text ?? '{}') as Record<string, unknown>;
		fake('/movie/27205', json(200, { ...details, poster_path: null }));
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"'));
		app.vault.put(POSTER_PATH, OLD_POSTER);
		userChooses('Refresh 1 due');
		await refreshTmdbNotes(plugin());
		assert.equal(app.files.get(POSTER_PATH), OLD_POSTER, 'kept');
		assert.ok(notices.some((n) => n.includes('TMDB has no poster for: Inception. The old poster was kept; delete it if you like.')));

		app = makeApp();
		resetUi();
		fake('/movie/27205', tmdbAnswers.movieDetails());
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"', 'My images/inception.jpg'));
		app.vault.put('My images/inception.jpg', OLD_POSTER);
		userChooses('Refresh 1 due');
		await refreshTmdbNotes(plugin());
		assert.equal(app.files.get('My images/inception.jpg'), OLD_POSTER, 'the user’s own image is never changed');
		assert.ok(app.files.has(POSTER_PATH));
		assert.equal(frontmatter(app, NOTE).localCover, `[[${POSTER_PATH}]]`);
	});

	it('needs the key, and stops when TMDB rejects it', async () => {
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"'));
		await refreshTmdbNotes(plugin(false));
		assert.ok(notices.includes('Refreshing needs your TMDB key. Add it in Settings → Watchlist Notes → TMDB.'));
		assert.equal(ui.choices.length, 0);
		assert.equal(requests.length, 0);

		fake('/movie/', tmdbAnswers.invalidKey());
		app.vault.put('Watch Library/Movies/Dune.md', '---\nsourceUrl: https://www.themoviedb.org/movie/438631\n---\n');
		userChooses('Refresh 2 due');
		await refreshTmdbNotes(plugin());
		assert.equal(requests.length, 1, 'stopped after the first');
		assert.ok(notices.some((n) => n.startsWith('Refreshed 0 notes from TMDB.\nStopped: TMDB rejected the key.')));
	});

	it('says which notes can’t be refreshed', async () => {
		app.vault.put('Watch Library/Movies/Hand made.md', '---\nsource: TMDB\n---\n');
		await refreshTmdbNotes(plugin());
		assert.ok(notices.some((n) => /^This note says it’s from TMDB but has no TMDB address in sourceUrl, so it can’t be refreshed: Hand made\.$/.test(n)));
	});

	it('reminds once per session when notes are due, and shows the status in the settings', () => {
		app.vault.put(NOTE, movieNote('created: "2025-01-01 10:00:00"'));
		app.vault.put('Watch Library/TV Shows/Breaking Bad.md', `---\nsourceUrl: https://www.themoviedb.org/tv/1396\nsourceUpdated: ${today}\n---\n`);
		remindIfDue(plugin());
		remindIfDue(plugin());
		assert.deepEqual(notices, ['1 note from TMDB is due for a refresh (TMDB allows keeping its data for up to 6 months). Run "Refresh TMDB notes".']);
		assert.match(refreshStatus(plugin()), /^1 of your 2 notes from TMDB was last updated more than 5 months ago\./);
		app = makeApp();
		assert.match(refreshStatus(plugin()), /^No notes from TMDB yet\./);
	});
});
