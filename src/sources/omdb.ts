import { MediaError } from '../core/errors';
import { badResponse, httpRequest, parseJson, Progress } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, uniqueStrings } from '../core/utils';
import type WatchlistNotesPlugin from '../main';
import type { MediaType } from '../media/types';
import { normalizeGenres, preferYear, score, yearOf } from './common';
import { emptyTitle, MediaSource, SearchResult, Title } from './types';

// OMDb: needs the user's own free key (1,000 requests a day). https://www.omdbapi.com
// Content licensed CC BY-NC 4.0. The key can only be sent in the URL, so request URLs are never
// logged (core/http.ts). Free keys get posters as links to Amazon's IMDb image service; the
// separate Poster API is for patrons only and isn't used.
const NAME = 'OMDb';
const BASE = 'https://www.omdbapi.com/';
const THROTTLE: ThrottleRule = { key: 'omdb', intervalMs: 250 };
const CAST_LIMIT = 5;

export const omdb: MediaSource = {
	id: 'omdb',
	name: NAME,
	types: ['movie', 'tv'],
	throttle: THROTTLE,
	needsKey: true,

	isConfigured: (plugin) => omdbKey(plugin) !== '',

	async search(query, type, plugin, progress) {
		if (query.imdbId) {
			const item = await omdbGet({ i: query.imdbId, plot: 'full' }, plugin, progress);
			return item ? [fromDetails(item, type)].map(toResult) : [];
		}
		const data = await omdbGet({ s: query.text, type: type === 'movie' ? 'movie' : 'series' }, plugin, progress);
		const items = (data && Array.isArray(field(data, 'Search')) ? (field(data, 'Search') as unknown[]) : []).map(asRecord);
		return preferYear(
			items.filter((item) => text(item, 'imdbID') && text(item, 'Title')).map((item) => toResult(fromSearchItem(item, type))),
			query.year,
		);
	},

	async details(result, plugin, progress) {
		const item = await omdbGet({ i: result.ref.id ?? '', plot: 'full' }, plugin, progress);
		if (!item) throw new MediaError('not-found', 'OMDb has no entry for this title.');
		return fromDetails(item, result.title.type);
	},

	async check(plugin) {
		const item = await omdbGet({ i: 'tt1375666' }, plugin);
		if (!item) throw badResponse(NAME);
		return 'OMDb is working: your key is valid.';
	},
};

function omdbKey(plugin: WatchlistNotesPlugin): string {
	return plugin.getSecret(plugin.settings.omdbKeySecret).trim();
}

/** GET from OMDb. Resolves with null when OMDb found nothing; throws for every other problem. */
async function omdbGet(params: Record<string, string>, plugin: WatchlistNotesPlugin, progress?: Progress): Promise<Record<string, unknown> | null> {
	const key = omdbKey(plugin);
	if (!key) throw new MediaError('config', 'OMDb needs a key. Add one in Settings → Watchlist Notes → OMDb.');
	const query = new URLSearchParams({ ...params, apikey: key });
	const response = await httpRequest(`${BASE}?${query.toString()}`, { sourceName: NAME, throttle: THROTTLE, onProgress: progress });
	// OMDb answers problems as {"Response":"False","Error":"…"}, with status 200 or 401.
	let data: Record<string, unknown>;
	try {
		data = asRecord(parseJson(response, NAME));
	} catch (err) {
		if (response.status === 401) throw omdbError('Invalid API key!');
		throw err;
	}
	if (text(data, 'Response') === 'True') return data;
	const error = text(data, 'Error');
	if (/not found|incorrect imdb id/i.test(error)) return null;
	throw omdbError(error);
}

/** OMDb's error texts, in words the user can act on. */
export function omdbError(error: string): MediaError {
	if (/invalid api key/i.test(error)) return new MediaError('auth', 'OMDb rejected the key. Check it in Settings → Watchlist Notes → OMDb.');
	if (/no api key/i.test(error)) return new MediaError('config', 'OMDb needs a key. Add one in Settings → Watchlist Notes → OMDb.');
	if (/limit reached/i.test(error)) {
		return new MediaError('rate-limited', "Your OMDb key has used up today's 1,000 requests. Try again tomorrow, or search another source.");
	}
	if (/too many results/i.test(error)) return new MediaError('not-found', 'OMDb found too many results. Try more words.');
	return new MediaError('bad-response', error ? `OMDb couldn't answer: ${error}` : "OMDb sent a response Watchlist Notes couldn't read. Try again later.");
}

/** A field by name, ignoring capitals (OMDb uses "Title", "imdbID", "totalSeasons"). */
function field(item: Record<string, unknown>, name: string): unknown {
	if (name in item) return item[name];
	const key = Object.keys(item).find((k) => k.toLowerCase() === name.toLowerCase());
	return key === undefined ? undefined : item[key];
}

/** A text field, with OMDb's "N/A" read as empty. */
function text(item: Record<string, unknown>, name: string): string {
	const value = asString(field(item, name));
	return value === 'N/A' ? '' : value;
}

/** "Christopher Nolan, Jonathan Nolan" → a list. */
function list(item: Record<string, unknown>, name: string): string[] {
	return uniqueStrings(text(item, name).split(',').map((part) => part.trim()));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** OMDb dates such as "16 Jul 2010" → "2010-07-16"; "" when unreadable. */
export function omdbDate(value: string): string {
	const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(value.trim());
	if (!match) return '';
	const month = MONTHS.indexOf((match[2] ?? '').toLowerCase()) + 1;
	return month ? `${match[3]}-${String(month).padStart(2, '0')}-${(match[1] ?? '').padStart(2, '0')}` : '';
}

function source(imdbId: string): Title['source'] {
	return { id: 'omdb', name: NAME, url: `https://www.imdb.com/title/${imdbId}/`, key: `imdb-${imdbId}` };
}

/** A search result has only title, year, ID, type, and poster. */
function fromSearchItem(item: Record<string, unknown>, type: MediaType): Title {
	const imdbId = text(item, 'imdbID');
	const poster = text(item, 'Poster');
	return {
		...emptyTitle(type, source(imdbId)),
		title: text(item, 'Title'),
		year: yearOf(text(item, 'Year')),
		imdbId,
		posterUrl: poster,
		posterDownloadUrl: poster,
	};
}

function fromDetails(item: Record<string, unknown>, type: MediaType): Title {
	const title = fromSearchItem(item, type);
	const released = omdbDate(text(item, 'Released'));
	title.genres = normalizeGenres(list(item, 'Genre'));
	title.cast = list(item, 'Actors').slice(0, CAST_LIMIT);
	title.description = text(item, 'Plot');
	title.score = score(Number(text(item, 'imdbRating')));
	const runtime = /(\d+)\s*min/.exec(text(item, 'Runtime'));
	title.runtime = runtime ? Number(runtime[1]) : null;
	if (type === 'movie') {
		title.releaseDate = released;
		title.directors = list(item, 'Director');
	} else {
		// Series years look like "2008–2013" (ended) or "2019–" (still running).
		const years = /^(\d{4})\s*[–-]\s*(\d{4})?$/.exec(text(item, 'Year'));
		title.firstAired = released;
		title.lastAired = years?.[2] ?? '';
		title.status = years ? (years[2] ? 'Ended' : 'Running') : '';
		// For series, OMDb's "Writer" holds the creators.
		title.creators = list(item, 'Writer');
		const seasons = Number(text(item, 'totalSeasons'));
		title.seasons = Number.isFinite(seasons) && seasons > 0 ? seasons : null;
	}
	return title;
}

function toResult(title: Title): SearchResult {
	return { title, thumbnailUrl: title.posterUrl, ref: { id: title.imdbId } };
}
