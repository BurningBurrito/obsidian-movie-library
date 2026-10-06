import type { TemplateVariables } from '../core/render';
import type { AnimeTitle } from '../settings';
import type { Title } from '../sources/types';
import { MEDIA_WORDS, MediaType } from './types';

/** Where "Create editable templates" saves copies of the built-in templates. */
export const TEMPLATE_COPY_PATHS: Record<MediaType, string> = {
	movie: 'Templates/Movie note.md',
	tv: 'Templates/TV show note.md',
	anime: 'Templates/Anime note.md',
};

// The same in all three: your own properties, where the data came from, and the body.
const SHARED_END = `watched: false
rating: N/A
owned: N/A
streaming: N/A
source: {{source}}
sourceUrl: {{sourceUrl}}
created: {{date:YYYY-MM-DD HH:mm:ss}}
link:
  - {{libraryLink}}
---
# Summary:

# Notes:

# Quotes:
`;

export const BUILT_IN_TEMPLATES: Record<MediaType, string> = {
	movie: `---
tags:
  - 🎬Movie
title: {{title}}
originalTitle: {{originalTitle}}
year: {{year}}
releaseDate: {{releaseDate}}
director: {{director}}
cast: {{cast}}
genre: {{genre}}
runtime: {{runtime}}
score: {{score}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
${SHARED_END}`,

	tv: `---
tags:
  - 📺TVShow
title: {{title}}
year: {{year}}
firstAired: {{firstAired}}
lastAired: {{lastAired}}
status: {{status}}
creator: {{creator}}
network: {{network}}
seasons: {{seasons}}
episodes: {{episodes}}
cast: {{cast}}
genre: {{genre}}
score: {{score}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
${SHARED_END}`,

	anime: `---
tags:
  - 🎌Anime
title: {{title}}
englishTitle: {{englishTitle}}
romajiTitle: {{romajiTitle}}
japaneseTitle: {{japaneseTitle}}
format: {{format}}
year: {{year}}
episodes: {{episodes}}
status: {{status}}
firstAired: {{firstAired}}
lastAired: {{lastAired}}
studio: {{studio}}
genre: {{genre}}
score: {{score}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
${SHARED_END}`,
};

/**
 * The title that names the note and fills {{title}}. For anime it follows the
 * "Anime title" setting; English and Japanese fall back to romaji.
 */
export function displayTitle(title: Title, animeTitle: AnimeTitle): string {
	if (title.type !== 'anime') return title.title;
	const romaji = title.romajiTitle || title.title;
	if (animeTitle === 'english') return title.englishTitle || romaji;
	if (animeTitle === 'japanese') return title.japaneseTitle || romaji;
	return romaji;
}

export interface NoteContext {
	/** From displayTitle(). */
	noteTitle: string;
	/** Vault path of the saved poster, or null when there's none. */
	posterPath: string | null;
	/** Name of the library note, for the back-link. */
	libraryNoteName: string;
}

export function buildVariables(title: Title, context: NoteContext): TemplateVariables {
	const posterPath = context.posterPath ?? '';
	const number = (value: number | null) => value ?? '';
	return {
		title: context.noteTitle,
		// Only when it says something the title doesn't.
		originalTitle: title.originalTitle !== title.title ? title.originalTitle : '',
		englishTitle: title.englishTitle,
		romajiTitle: title.romajiTitle,
		japaneseTitle: title.japaneseTitle,
		year: number(title.year),
		releaseDate: title.releaseDate,
		firstAired: title.firstAired,
		lastAired: title.lastAired,
		status: title.status,
		director: title.directors,
		creator: title.creators,
		studio: title.studios,
		network: title.network,
		cast: title.cast,
		genre: title.genres,
		runtime: number(title.runtime),
		seasons: number(title.seasons),
		episodes: number(title.episodes),
		format: title.format,
		ageRating: title.ageRating,
		season: title.season,
		score: number(title.score),
		description: title.description,
		imdbId: title.imdbId,
		mediaType: MEDIA_WORDS[title.type].label,
		coverUrl: title.posterUrl,
		// A link (not a plain path) so Obsidian keeps it up to date if the image is renamed or moved.
		localCover: posterPath ? `[[${posterPath}]]` : '',
		localCoverPath: posterPath,
		source: title.source.name,
		sourceUrl: title.source.url,
		libraryLink: `[[${context.libraryNoteName}]]`,
	};
}
