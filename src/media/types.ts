/** The kinds of titles the plugin handles. Each has its own folder, template, sources, and table. */
export type MediaType = 'movie' | 'tv' | 'anime';

/** In the order the library note lists them. */
export const MEDIA_TYPES: readonly MediaType[] = ['movie', 'tv', 'anime'];

/** Headings in the library note. */
export const MEDIA_HEADINGS: Record<MediaType, string> = {
	movie: 'Movies',
	tv: 'TV shows',
	anime: 'Anime',
};

/** Words for messages: "This TV show already has a note", "No movies found". */
export const MEDIA_WORDS: Record<MediaType, { one: string; a: string; many: string; label: string }> = {
	movie: { one: 'movie', a: 'a movie', many: 'movies', label: 'Movie' },
	tv: { one: 'TV show', a: 'a TV show', many: 'TV shows', label: 'TV show' },
	anime: { one: 'anime', a: 'an anime', many: 'anime', label: 'Anime' },
};
