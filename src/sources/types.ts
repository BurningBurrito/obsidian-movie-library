import type { Progress } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import type WatchlistNotesPlugin from '../main';
import type { MediaType } from '../media/types';

export type SourceId = 'tmdb' | 'omdb' | 'tvmaze' | 'tenrai' | 'jikan';

/**
 * Everything a source knows about one movie, TV show, or anime, in one shape
 * for all sources. Unknown text is "", unknown numbers are null, unknown lists
 * are empty.
 */
export interface Title {
	type: MediaType;
	title: string;
	/** The title in its original language, e.g. a French film's French title. */
	originalTitle: string;
	/** Anime: the three titles the "Anime title" setting chooses from. */
	englishTitle: string;
	romajiTitle: string;
	japaneseTitle: string;
	year: number | null;
	/** Movies: "2010-07-15", or as precise as the source knows. */
	releaseDate: string;
	/** TV and anime: first and last air dates, "YYYY-MM-DD". */
	firstAired: string;
	lastAired: string;
	/** As the source says it, e.g. "Running", "Ended", "Finished Airing". */
	status: string;
	directors: string[];
	creators: string[];
	studios: string[];
	/** TV: network or streaming service. */
	network: string;
	cast: string[];
	genres: string[];
	/** Minutes; per episode for TV and anime. */
	runtime: number | null;
	seasons: number | null;
	episodes: number | null;
	/** Anime: TV, Movie, OVA, ONA, Special, TV Special. */
	format: string;
	/** Anime: e.g. "PG-13 - Teens 13 or older". */
	ageRating: string;
	/** Anime: e.g. "Fall 2023". */
	season: string;
	/** The source's average score, 0–10. */
	score: number | null;
	description: string;
	/** Poster web address for the note's `cover` property. */
	posterUrl: string;
	/** The poster to save in the vault ("" for none); may be a smaller size than `posterUrl`. */
	posterDownloadUrl: string;
	imdbId: string;
	source: {
		id: SourceId;
		name: string;
		/** The title's page on the source's website. */
		url: string;
		/** The source and its ID, used in poster file names, e.g. "tvmaze-44933". */
		key: string;
	};
}

/** A Title with nothing known yet but its type and source. */
export function emptyTitle(type: MediaType, source: Title['source']): Title {
	return {
		type,
		title: '',
		originalTitle: '',
		englishTitle: '',
		romajiTitle: '',
		japaneseTitle: '',
		year: null,
		releaseDate: '',
		firstAired: '',
		lastAired: '',
		status: '',
		directors: [],
		creators: [],
		studios: [],
		network: '',
		cast: [],
		genres: [],
		runtime: null,
		seasons: null,
		episodes: null,
		format: '',
		ageRating: '',
		season: '',
		score: null,
		description: '',
		posterUrl: '',
		posterDownloadUrl: '',
		imdbId: '',
		source,
	};
}

/** What the user typed, taken apart. */
export interface SearchQuery {
	/** The search text, without a year in parentheses. */
	text: string;
	/** From "Dune (2021)". */
	year: number | null;
	/** From "tt1375666" or an IMDb link. */
	imdbId: string | null;
	/** From a MyAnimeList link. */
	malId: number | null;
}

/** One row in the search results list. */
export interface SearchResult {
	/** What the list shows; also the note's data if details can't be fetched. */
	title: Title;
	/** Small poster for the results list, or "". */
	thumbnailUrl: string;
	/** Source-specific IDs needed to fetch details. */
	ref: Record<string, string>;
}

export interface MediaSource {
	id: SourceId;
	name: string;
	/** The types this source can search. */
	types: readonly MediaType[];
	/** Spacing for this source's API requests. */
	throttle?: ThrottleRule;
	/** Whether the source can be used: always for the free ones; once a key is set for the others. */
	isConfigured(plugin: WatchlistNotesPlugin): boolean;
	/** Search. Resolves with [] when nothing matches; throws a MediaError on failure. */
	search(query: SearchQuery, type: MediaType, plugin: WatchlistNotesPlugin, progress?: Progress): Promise<SearchResult[]>;
	/** Fill in what the search didn't include, such as the cast. */
	details(result: SearchResult, plugin: WatchlistNotesPlugin, progress?: Progress): Promise<Title>;
	/** A tiny real request for the "Check" buttons in settings. Resolves with a message for the user. */
	check(plugin: WatchlistNotesPlugin): Promise<string>;
}
