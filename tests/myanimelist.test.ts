import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { clearCache, setUserAgent } from '../src/core/http';
import type { WatchlistNotesSettings } from '../src/settings';
import { parseQuery } from '../src/sources';
import { cleanSynopsis, jikan, minutes, tenrai } from '../src/sources/myanimelist';
import { fake, json, requests, resetNetwork } from './support/network';
import { jikanAnswer } from './support/titles';
import { makeApp, makePlugin } from './support/vault';

const plugin = (settings: Partial<WatchlistNotesSettings> = {}) => makePlugin(makeApp(), settings);

describe('anime from MyAnimeList (recorded Tenrai answers)', () => {
	before(() => setUserAgent('WatchlistNotes/test (+https://github.com/BurningBurrito/obsidian-movie-library)'));
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('searches with adult titles hidden, and keeps all three titles', async () => {
		const results = await tenrai.search(parseQuery('frieren'), 'anime', plugin());
		assert.equal(requests[0]?.url, 'https://api.tenrai.org/v1/anime?q=frieren&limit=20&sfw=true');
		const frieren = results.find((r) => r.title.source.key === 'mal-52991')?.title;
		assert.ok(frieren, 'Frieren is in the results');
		assert.equal(frieren.romajiTitle, 'Sousou no Frieren');
		assert.equal(frieren.englishTitle, "Frieren: Beyond Journey's End");
		assert.equal(frieren.japaneseTitle, '葬送のフリーレン');
		assert.equal(frieren.format, 'TV');
		assert.equal(frieren.year, 2023);
		assert.equal(frieren.episodes, 28);
		assert.equal(frieren.firstAired, '2023-09-29');
		assert.equal(frieren.lastAired, '2024-03-22');
		assert.deepEqual(frieren.studios, ['Madhouse']);
		assert.ok(frieren.genres.includes('Fantasy') && !frieren.genres.some((g) => /award/i.test(g)), frieren.genres.join(', '));
		assert.equal(frieren.season, 'Fall 2023');
		assert.match(frieren.ageRating, /^PG-13/);
		assert.ok((frieren.score ?? 0) > 8);
		assert.doesNotMatch(frieren.description, /Written by MAL Rewrite/);
		assert.match(frieren.posterDownloadUrl, /^https:\/\/cdn\.myanimelist\.net\/images\/anime\/.+l\.jpg$/);
		assert.equal(frieren.source.url, 'https://myanimelist.net/anime/52991/Sousou_no_Frieren');
		assert.equal(frieren.source.name, 'Tenrai');
	});

	it('finds films by their English title, and leaves out commercials and promo videos', async () => {
		const results = await tenrai.search(parseQuery('your name'), 'anime', plugin());
		const film = results[0]?.title;
		assert.equal(film?.romajiTitle, 'Kimi no Na wa.');
		assert.equal(film?.englishTitle, 'Your Name.');
		assert.equal(film?.format, 'Movie');
		assert.ok((film?.runtime ?? 0) > 100, `runtime ${film?.runtime}`);
		assert.ok(!results.some((r) => ['CM', 'PV', 'Music'].includes(r.title.format)), results.map((r) => r.title.format).join(', '));
	});

	it('hides adult titles unless the setting is off', async () => {
		assert.deepEqual(await tenrai.search(parseQuery('highschool dxd'), 'anime', plugin()), []);
		const shown = await tenrai.search(parseQuery('highschool dxd'), 'anime', plugin({ hideAdult: false }));
		assert.ok(shown.length > 0);
		assert.ok(shown.some((r) => r.title.ageRating.startsWith('R+')), 'the adult-rated entries are what the setting hid');
		assert.doesNotMatch(requests.at(-1)?.url ?? '', /sfw/);
	});

	it('finds one anime from a MyAnimeList link, and nothing for an unknown link or nonsense', async () => {
		const byLink = await tenrai.search(parseQuery('https://myanimelist.net/anime/32281/Kimi_no_Na_wa'), 'anime', plugin());
		assert.deepEqual(byLink.map((r) => r.title.englishTitle), ['Your Name.']);
		assert.deepEqual(await tenrai.search(parseQuery('https://myanimelist.net/anime/99999999'), 'anime', plugin()), []);
		assert.deepEqual(await tenrai.search(parseQuery('qwxzzvbnmlkj'), 'anime', plugin()), []);
	});

	it('has a check for the settings', async () => {
		assert.equal(await tenrai.check(plugin()), 'Tenrai is working.');
	});

	it('says when MyAnimeList can’t be reached, after retrying', async () => {
		fake('api.tenrai.org', json(504, { status: 504, type: 'BadResponseException', message: 'Failed to connect to MyAnimeList' }));
		await assert.rejects(tenrai.search(parseQuery('frieren'), 'anime', plugin()), /Tenrai can't reach MyAnimeList right now/);
		assert.equal(requests.length, 3);
	});

	it('reads Jikan the same way, at its own address and slower pace', async () => {
		fake('api.jikan.moe', json(200, jikanAnswer()));
		const [result] = await jikan.search(parseQuery('frieren'), 'anime', plugin());
		assert.match(requests[0]?.url ?? '', /^https:\/\/api\.jikan\.moe\/v4\/anime\?q=frieren&limit=20&sfw=true$/);
		assert.equal(result?.title.source.name, 'Jikan');
		assert.equal(result?.title.source.key, 'mal-52991', 'same poster file as from Tenrai');
		assert.equal(result?.title.englishTitle, "Frieren: Beyond Journey's End");
		assert.equal(jikan.throttle?.intervalMs, 1000);
		assert.equal(tenrai.throttle?.intervalMs, 500);
	});

	it('reads durations and cleans synopses', () => {
		assert.equal(minutes('24 min per ep'), 24);
		assert.equal(minutes('2 hr 4 min'), 124);
		assert.equal(minutes('1 hr'), 60);
		assert.equal(minutes('Unknown'), null);
		assert.equal(cleanSynopsis('A story.\n\n(Source: Crunchyroll)\n\n[Written by MAL Rewrite]'), 'A story.\n\n(Source: Crunchyroll)');
	});
});
