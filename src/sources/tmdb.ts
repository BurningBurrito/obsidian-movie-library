import type { RequestUrlResponse } from 'obsidian';
import { MediaError } from '../core/errors';
import { badResponse, httpRequest, parseJson, Progress } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, uniqueStrings } from '../core/utils';
import type WatchlistNotesPlugin from '../main';
import type { MediaType } from '../media/types';
import { normalizeGenres, positiveInt, preferYear, score, yearOf } from './common';
import { emptyTitle, MediaSource, SearchQuery, SearchResult, Title } from './types';

// TMDB (The Movie Database): needs the user's own free key. https://developer.themoviedb.org
// Free for non-commercial use with attribution (logo and notice in the settings' Credits and the
// README). Its terms limit keeping TMDB data to 6 months; see "Refresh TMDB notes".
const NAME = 'TMDB';
const API = 'https://api.themoviedb.org/3';
const IMAGES = 'https://image.tmdb.org/t/p';
const SITE = 'https://www.themoviedb.org';
// "somewhere in the 40 requests per second range"
const THROTTLE: ThrottleRule = { key: 'tmdb', intervalMs: 100 };
const CAST_LIMIT = 5;
// TMDB's genre ID for Animation; it has no separate anime category.
const ANIMATION = 16;

type Kind = 'movie' | 'tv';

export const tmdb: MediaSource = {
	id: 'tmdb',
	name: NAME,
	types: ['movie', 'tv', 'anime'],
	throttle: THROTTLE,
	needsKey: true,

	isConfigured: (plugin) => tmdbKey(plugin) !== '',

	async search(query, type, plugin, progress) {
		if (query.imdbId) return findByImdbId(query.imdbId, type, plugin, progress);
		if (type === 'anime') {
			// TV shows and films that are animation, Japanese ones first.
			const items = [...(await searchKind('tv', query, plugin, progress)), ...(await searchKind('movie', query, plugin, progress))].filter(
				({ item }) => Array.isArray(item.genre_ids) && item.genre_ids.includes(ANIMATION),
			);
			items.sort((a, b) => Number(asString(b.item.original_language) === 'ja') - Number(asString(a.item.original_language) === 'ja'));
			return preferYear(
				items.map(({ item, kind }) => fromItem(item, kind, 'anime')),
				query.year,
			);
		}
		const kind: Kind = type === 'movie' ? 'movie' : 'tv';
		const items = await searchKind(kind, query, plugin, progress);
		return preferYear(
			items.map(({ item }) => fromItem(item, kind, type)),
			query.year,
		);
	},

	async details(result, plugin, progress) {
		const kind: Kind = result.ref.kind === 'tv' ? 'tv' : 'movie';
		const params = new URLSearchParams({
			append_to_response: kind === 'tv' ? 'credits,external_ids' : 'credits',
			language: language(plugin),
		});
		const data = asRecord(await tmdbGet(`/${kind}/${encodeURIComponent(result.ref.id ?? '')}?${params.toString()}`, plugin, progress));
		if (typeof data.id !== 'number') throw badResponse(NAME);
		return fromDetails(data, kind, result.title.type);
	},

	async check(plugin) {
		const data = asRecord(await tmdbGet('/authentication', plugin));
		if (data.success !== true) throw badResponse(NAME);
		return 'TMDB is working: your key is valid.';
	},
};

/** The key from Obsidian's keychain, or "" when none is set. */
function tmdbKey(plugin: WatchlistNotesPlugin): string {
	return plugin.getSecret(plugin.settings.tmdbKeySecret).trim();
}

/** TMDB's "API Read Access Token" is a JWT; the shorter "API key" isn't. */
export function isReadAccessToken(key: string): boolean {
	return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key);
}

function language(plugin: WatchlistNotesPlugin): string {
	return plugin.settings.language || 'en';
}

/**
 * GET from the TMDB API. The Read Access Token goes in the Authorization
 * header (never in a URL); the older API key can only go in the URL.
 */
async function tmdbGet(path: string, plugin: WatchlistNotesPlugin, progress?: Progress): Promise<unknown> {
	const key = tmdbKey(plugin);
	if (!key) throw new MediaError('config', 'TMDB needs a key. Add one in Settings → Watchlist Notes → TMDB.');
	const token = isReadAccessToken(key);
	const url = token ? `${API}${path}` : `${API}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
	const response = await httpRequest(url, {
		sourceName: NAME,
		throttle: THROTTLE,
		onProgress: progress,
		headers: token ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
	});
	if (response.status === 200) return parseJson(response, NAME);
	throw tmdbError(response);
}

/** TMDB's error answers, in words the user can act on. */
export function tmdbError(response: RequestUrlResponse): MediaError {
	let code = 0;
	try {
		code = Number(asRecord(JSON.parse(response.text)).status_code);
	} catch {
		// Not JSON: fall through to the general messages.
	}
	if (response.status === 401 || code === 7) {
		return new MediaError(
			'auth',
			'TMDB rejected the key. Check it in Settings → Watchlist Notes → TMDB (use the API Read Access Token or the API key from your TMDB account).',
		);
	}
	if (response.status === 404 || code === 34) return new MediaError('not-found', 'TMDB has no entry for this title.');
	return badResponse(NAME);
}

async function searchKind(
	kind: Kind,
	query: SearchQuery,
	plugin: WatchlistNotesPlugin,
	progress?: Progress,
): Promise<{ item: Record<string, unknown>; kind: Kind }[]> {
	const params = new URLSearchParams({
		query: query.text,
		include_adult: String(!plugin.settings.hideAdult),
		language: language(plugin),
		page: '1',
	});
	if (query.year) params.set(kind === 'movie' ? 'primary_release_year' : 'first_air_date_year', String(query.year));
	const data = asRecord(await tmdbGet(`/search/${kind}?${params.toString()}`, plugin, progress));
	if (!Array.isArray(data.results)) throw badResponse(NAME);
	return data.results.map(asRecord).filter((item) => isTitle(item, kind)).map((item) => ({ item, kind }));
}

async function findByImdbId(imdbId: string, type: MediaType, plugin: WatchlistNotesPlugin, progress?: Progress): Promise<SearchResult[]> {
	const params = new URLSearchParams({ external_source: 'imdb_id', language: language(plugin) });
	const data = asRecord(await tmdbGet(`/find/${encodeURIComponent(imdbId)}?${params.toString()}`, plugin, progress));
	const list = (kind: Kind) =>
		(Array.isArray(data[`${kind}_results`]) ? (data[`${kind}_results`] as unknown[]) : [])
			.map(asRecord)
			.filter((item) => isTitle(item, kind))
			.map((item) => fromItem(item, kind, type));
	// Movies are looked up among films, TV shows among series; anime may be either.
	if (type === 'movie') return list('movie');
	if (type === 'tv') return list('tv');
	return [...list('tv'), ...list('movie')];
}

function isTitle(item: Record<string, unknown>, kind: Kind): boolean {
	return typeof item.id === 'number' && asString(kind === 'movie' ? item.title : item.name) !== '';
}

/** A search or lookup result (the same fields appear in the details answer). */
function fromItem(item: Record<string, unknown>, kind: Kind, type: MediaType): SearchResult {
	const id = String(item.id);
	const name = asString(kind === 'movie' ? item.title : item.name);
	const original = asString(kind === 'movie' ? item.original_title : item.original_name);
	const date = asString(kind === 'movie' ? item.release_date : item.first_air_date);
	const posterPath = asString(item.poster_path);
	const title: Title = {
		...emptyTitle(type, { id: 'tmdb', name: NAME, url: `${SITE}/${kind}/${id}`, key: `tmdb-${kind}-${id}` }),
		title: name,
		originalTitle: original,
		year: yearOf(date),
		score: score(item.vote_average),
		description: asString(item.overview),
		posterUrl: posterPath ? `${IMAGES}/w500${posterPath}` : '',
		posterDownloadUrl: posterPath ? `${IMAGES}/w500${posterPath}` : '',
	};
	if (kind === 'movie') title.releaseDate = date;
	else title.firstAired = date;
	if (type === 'anime') {
		// TMDB has the English and original titles, but no romaji one.
		title.englishTitle = name;
		title.japaneseTitle = asString(item.original_language) === 'ja' ? original : '';
		title.format = kind === 'movie' ? 'Movie' : 'TV';
		title.firstAired = date;
	}
	return { title, thumbnailUrl: posterPath ? `${IMAGES}/w154${posterPath}` : '', ref: { id, kind } };
}

/** The full answer for one movie or TV show, with credits (and, for TV, external IDs). */
function fromDetails(data: Record<string, unknown>, kind: Kind, type: MediaType): Title {
	const title = fromItem(data, kind, type).title;
	const names = (value: unknown) => uniqueStrings((Array.isArray(value) ? value : []).map((entry) => asString(asRecord(entry).name)));
	const credits = asRecord(data.credits);
	const cast = (Array.isArray(credits.cast) ? credits.cast : [])
		.map(asRecord)
		.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
	title.genres = normalizeGenres(names(data.genres));
	title.cast = names(cast).slice(0, CAST_LIMIT);
	title.studios = type === 'anime' ? names(data.production_companies) : [];

	if (kind === 'movie') {
		const crew = (Array.isArray(credits.crew) ? credits.crew : []).map(asRecord);
		title.directors = names(crew.filter((c) => asString(c.job) === 'Director'));
		title.runtime = positiveInt(data.runtime);
		title.imdbId = asString(data.imdb_id);
		if (type === 'anime') title.episodes = 1;
	} else {
		title.creators = names(data.created_by);
		title.network = names(data.networks)[0] ?? '';
		title.seasons = positiveInt(data.number_of_seasons);
		title.episodes = positiveInt(data.number_of_episodes);
		title.lastAired = asString(data.last_air_date);
		title.status = asString(data.status);
		title.runtime = positiveInt(Array.isArray(data.episode_run_time) ? data.episode_run_time[0] : null);
		title.imdbId = asString(asRecord(data.external_ids).imdb_id);
	}
	return title;
}
