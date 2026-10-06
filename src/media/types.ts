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
