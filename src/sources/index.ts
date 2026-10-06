import { MediaError, MediaErrorKind, toMediaError } from '../core/errors';
import type { Progress } from '../core/http';
import type WatchlistNotesPlugin from '../main';
import { MEDIA_WORDS, MediaType } from '../media/types';
import { jikan, tenrai } from './myanimelist';
import { tvmaze } from './tvmaze';
import type { MediaSource, SearchQuery, SearchResult, SourceId } from './types';

/** Every source. Tests may swap these for stand-ins. */
export const SOURCES: MediaSource[] = [tvmaze, tenrai, jikan];

/** The fallback order for each type (DESIGN.md §7). Sources that aren't set up are skipped. */
export const SOURCE_ORDER: Record<MediaType, readonly SourceId[]> = {
	movie: ['tmdb', 'omdb'],
	tv: ['tvmaze', 'tmdb', 'omdb'],
	anime: ['tenrai', 'jikan', 'tmdb'],
};

export function getSource(id: string): MediaSource | undefined {
	return SOURCES.find((source) => source.id === id);
}

/** Sources for this type that can be used now, in fallback order. */
export function configuredSources(plugin: WatchlistNotesPlugin, type: MediaType): MediaSource[] {
	return SOURCE_ORDER[type]
		.map(getSource)
		.filter((source): source is MediaSource => !!source && source.types.includes(type) && source.isConfigured(plugin));
}

/** The chosen source first, then the other configured sources for this type in order. */
export function sourceOrder(plugin: WatchlistNotesPlugin, type: MediaType, first: string | undefined): MediaSource[] {
	const available = configuredSources(plugin, type);
	const start = available.find((source) => source.id === first) ?? available[0];
	return start ? [start, ...available.filter((source) => source !== start)] : [];
}

// "tt1375666" or an IMDb link; a MyAnimeList anime link; a year in parentheses at the end.
// A bare year isn't used ("Blade Runner 2049" is a title).
const IMDB_ID = /^(?:https?:\/\/(?:www\.|m\.)?imdb\.com\/title\/)?(tt\d{7,10})\b/i;
const MAL_LINK = /myanimelist\.net\/anime\/(\d+)/i;
const YEAR_SUFFIX = /^(.*\S)\s*\((\d{4})\)$/;

/** Take apart what the user typed. */
export function parseQuery(input: string): SearchQuery {
	const text = input.trim();
	const imdbId = IMDB_ID.exec(text)?.[1]?.toLowerCase() ?? null;
	const malId = MAL_LINK.exec(text)?.[1];
	const withYear = YEAR_SUFFIX.exec(text);
	const year = withYear ? Number(withYear[2]) : NaN;
	const validYear = year >= 1870 && year <= 2100;
	return {
		text: validYear && withYear?.[1] ? withYear[1] : text,
		year: validYear ? year : null,
		imdbId,
		malId: malId ? Number(malId) : null,
	};
}

// A source that failed for one of these reasons is skipped as a fallback for a while, so a service
// that's down doesn't cost a timeout on every search. Choosing it with its button still works.
const SKIP_AFTER_FAILURE_MS = 10 * 60_000;
const TEMPORARY_FAILURES: MediaErrorKind[] = ['network', 'timeout', 'server', 'rate-limited', 'bad-response'];
const failedAt = new Map<SourceId, number>();

/** Forget recent failures (when the plugin is turned off, and in tests). */
export function forgetFailures(): void {
	failedAt.clear();
}

function failedRecently(id: SourceId): boolean {
	const at = failedAt.get(id);
	return at !== undefined && Date.now() - at < SKIP_AFTER_FAILURE_MS;
}

export interface SearchOutcome {
	results: SearchResult[];
	source: MediaSource;
	/** Set when an earlier source failed or found nothing and a later one answered. */
	fallback?: { from: string; reason: string };
}

const SEARCH_HINTS: Record<MediaType, string> = {
	movie: 'Try fewer words, or the IMDb ID.',
	tv: 'Try fewer words, or the IMDb ID.',
	anime: 'Try fewer words, the romaji title, or the MyAnimeList link.',
};

/**
 * Search the chosen source; if it fails or finds nothing and fallback is on,
 * try the next configured source for this type. Never falls back when
 * offline (every source would fail the same way).
 */
export async function searchTitles(
	input: string,
	type: MediaType,
	plugin: WatchlistNotesPlugin,
	first: string | undefined,
	progress?: Progress,
): Promise<SearchOutcome> {
	const query = parseQuery(input);
	const order = sourceOrder(plugin, type, first);
	const primary = order[0];
	if (!primary) {
		throw new MediaError('config', `No ${MEDIA_WORDS[type].one} source is set up. Check the Watchlist Notes settings.`);
	}
	const candidates = plugin.settings.useFallback ? order : [primary];

	let firstProblem: { source: MediaSource; error?: MediaError } | null = null;
	const searched: string[] = [];
	for (const source of candidates) {
		if (source !== primary && failedRecently(source.id)) continue;
		searched.push(source.name);
		progress?.(`Searching ${source.name}…`);
		try {
			const results = await source.search(query, type, plugin, progress);
			failedAt.delete(source.id);
			if (results.length > 0) {
				if (!firstProblem) return { results, source };
				return {
					results,
					source,
					fallback: {
						from: firstProblem.source.name,
						reason: firstProblem.error ? firstProblem.error.message : `${firstProblem.source.name} found nothing.`,
					},
				};
			}
			firstProblem ??= { source };
		} catch (err) {
			const error = toMediaError(err);
			if (error.kind === 'offline') throw error;
			if (TEMPORARY_FAILURES.includes(error.kind)) failedAt.set(source.id, Date.now());
			firstProblem ??= { source, error };
		}
	}
	// Nothing anywhere: report the chosen source's problem, which is the one the user can act on.
	if (firstProblem?.error) throw firstProblem.error;
	const where = searched.length > 1 ? ` (searched ${searched.join(', ')})` : '';
	throw new MediaError('not-found', `No ${MEDIA_WORDS[type].many} found for "${input}"${where}. ${SEARCH_HINTS[type]}`);
}
