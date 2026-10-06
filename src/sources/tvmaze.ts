import { badResponse, getJson, httpRequest, parseJson } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, uniqueStrings } from '../core/utils';
import { htmlToText, normalizeGenres, positiveInt, preferYear, score, yearOf } from './common';
import { emptyTitle, MediaSource, SearchResult, Title } from './types';

// TVmaze: free, no account. https://www.tvmaze.com/api
// Licensed CC BY-SA: each note links back to the show's TVmaze page (sourceUrl).
const NAME = 'TVmaze';
const BASE = 'https://api.tvmaze.com';
// "at least 20 calls every 10 seconds per IP address"
const THROTTLE: ThrottleRule = { key: 'tvmaze', intervalMs: 500 };
const CAST_LIMIT = 5;
// embed[]=cast&embed[]=crew&embed[]=seasons
const DETAIL_EMBEDS = 'embed%5B%5D=cast&embed%5B%5D=crew&embed%5B%5D=seasons';

export const tvmaze: MediaSource = {
	id: 'tvmaze',
	name: NAME,
	types: ['tv'],
	throttle: THROTTLE,

	isConfigured: () => true,

	async search(query, _type, _plugin, progress) {
		if (query.imdbId) {
			// Answers with a redirect to the show, or 404 when TVmaze doesn't know the ID.
			const response = await httpRequest(`${BASE}/lookup/shows?imdb=${encodeURIComponent(query.imdbId)}`, {
				sourceName: NAME,
				throttle: THROTTLE,
				onProgress: progress,
			});
			if (response.status === 404) return [];
			if (response.status !== 200) throw badResponse(NAME);
			const show = asRecord(parseJson(response, NAME));
			return isShow(show) ? [toResult(show)] : [];
		}
		const data = await getJson(`${BASE}/search/shows?q=${encodeURIComponent(query.text)}`, {
			sourceName: NAME,
			throttle: THROTTLE,
			cache: true,
			onProgress: progress,
		});
		const shows = (Array.isArray(data) ? data : []).map((hit) => asRecord(asRecord(hit).show)).filter(isShow);
		return preferYear(shows.map(toResult), query.year);
	},

	async details(result, _plugin, progress) {
		const show = asRecord(
			await getJson(`${BASE}/shows/${encodeURIComponent(result.ref.id ?? '')}?${DETAIL_EMBEDS}`, {
				sourceName: NAME,
				throttle: THROTTLE,
				cache: true,
				onProgress: progress,
			}),
		);
		if (!isShow(show)) throw badResponse(NAME);
		const title = toResult(show).title;
		const embedded = asRecord(show._embedded);
		const crew = asArray(embedded.crew).map(asRecord);
		title.creators = uniqueStrings(crew.filter((c) => asString(c.type) === 'Creator').map(personName));
		title.cast = uniqueStrings(asArray(embedded.cast).map(asRecord).map(personName)).slice(0, CAST_LIMIT);
		// Count seasons that have a date; announced seasons without one aren't counted yet.
		const seasons = asArray(embedded.seasons).map(asRecord).filter((s) => asString(s.premiereDate));
		title.seasons = seasons.length || null;
		const episodeCounts = seasons.map((s) => positiveInt(s.episodeOrder)).filter((n): n is number => n !== null);
		title.episodes = episodeCounts.length ? episodeCounts.reduce((sum, n) => sum + n, 0) : null;
		return title;
	},

	async check() {
		const show = asRecord(await getJson(`${BASE}/shows/1`, { sourceName: NAME, throttle: THROTTLE }));
		if (!isShow(show)) throw badResponse(NAME);
		return 'TVmaze is working.';
	},
};

function isShow(show: Record<string, unknown>): boolean {
	return typeof show.id === 'number' && asString(show.name) !== '';
}

/** A show from a search, a lookup, or the show endpoint (same fields in all three). */
function toResult(show: Record<string, unknown>): SearchResult {
	const id = String(show.id);
	const image = asRecord(show.image);
	const premiered = asString(show.premiered);
	const title: Title = {
		...emptyTitle('tv', {
			id: 'tvmaze',
			name: NAME,
			url: asString(show.url) || `https://www.tvmaze.com/shows/${id}`,
			key: `tvmaze-${id}`,
		}),
		title: asString(show.name),
		year: yearOf(premiered),
		firstAired: premiered,
		lastAired: asString(show.ended),
		status: asString(show.status),
		// Streaming shows have a "web channel" (e.g. Apple TV) instead of a network.
		network: asString(asRecord(show.network).name) || asString(asRecord(show.webChannel).name),
		genres: normalizeGenres(asArray(show.genres).map(asString)),
		runtime: positiveInt(show.averageRuntime) ?? positiveInt(show.runtime),
		score: score(asRecord(show.rating).average),
		description: htmlToText(asString(show.summary)),
		// The full-size poster is linked; the medium one (210×295) is saved, since originals can be several MB.
		posterUrl: asString(image.original),
		posterDownloadUrl: asString(image.medium),
		imdbId: asString(asRecord(show.externals).imdb),
	};
	return { title, thumbnailUrl: asString(image.medium), ref: { id } };
}

function personName(entry: Record<string, unknown>): string {
	return asString(asRecord(entry.person).name);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
