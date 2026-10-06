import { uniqueStrings } from '../core/utils';
import type { SearchResult } from './types';

/** HTML text (TVmaze summaries) → plain text, keeping paragraph breaks. */
export function htmlToText(html: string): string {
	if (!/[<&]/.test(html)) return html.trim();
	const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
	const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
	return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** The year of a date such as "2022-02-18", or null. */
export function yearOf(date: string): number | null {
	const match = /^(\d{4})/.exec(date.trim());
	return match ? Number(match[1]) : null;
}

/** A whole number above zero (runtime, episodes), or null. */
export function positiveInt(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/** A score above zero, to two decimals (0 means "no score" at every source), or null. */
export function score(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** With "Title (2021)", the results from that year first; the others still follow in case the year was off. */
export function preferYear(results: SearchResult[], year: number | null): SearchResult[] {
	if (year === null) return results;
	const matching = results.filter((result) => result.title.year === year);
	return [...matching, ...results.filter((result) => result.title.year !== year)];
}

// Sources name some genres differently; each gets one name, in sentence case.
const GENRE_NAMES: Record<string, string> = {
	'sci-fi': 'Science fiction',
	'science-fiction': 'Science fiction',
	'science fiction': 'Science fiction',
	'tv movie': 'TV movie',
};
// Labels that sources list among genres but that aren't genres.
const NOT_GENRES = new Set(['award winning']);

/** "Sci-Fi & Fantasy", "Science-Fiction", "Slice of Life" → "Science fiction", "Fantasy", "Slice of life". */
export function normalizeGenres(names: string[]): string[] {
	return uniqueStrings(
		names
			.flatMap((name) => name.split(/\s+&\s+/))
			.map((name) => name.trim())
			.filter((name) => name && !NOT_GENRES.has(name.toLowerCase()))
			.map((name) => GENRE_NAMES[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()),
	);
}
