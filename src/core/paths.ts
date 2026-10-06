import type { MediaType } from '../media/types';
import type { WatchlistNotesSettings } from '../settings';
import { joinPath, normalizeFolder, safeFileName } from './notes';

/** Where everything lives, from the folder settings. The root may be nested, e.g. "Synced Notes/Watch Library". */
export interface LibraryPaths {
	root: string;
	/** One folder per media type, inside the root. */
	folders: Record<MediaType, string>;
	posters: string;
	/** Name of the library note, without ".md" (also used for links to it). */
	libraryNoteName: string;
	/** Full path of the library note. */
	libraryNote: string;
}

export function libraryPaths(settings: WatchlistNotesSettings): LibraryPaths {
	const root = normalizeFolder(settings.libraryFolder);
	const libraryNoteName = safeFileName(settings.libraryNoteName, 'Watch Library MOC');
	return {
		root,
		folders: {
			movie: joinPath(root, normalizeFolder(settings.moviesFolder)),
			tv: joinPath(root, normalizeFolder(settings.tvFolder)),
			anime: joinPath(root, normalizeFolder(settings.animeFolder)),
		},
		posters: joinPath(root, normalizeFolder(settings.postersFolder)),
		libraryNoteName,
		libraryNote: joinPath(root, `${libraryNoteName}.md`),
	};
}

/** Whether a vault path is inside a folder ("" = the whole vault). */
export function isInFolder(path: string, folder: string): boolean {
	return folder === '' || path.startsWith(`${folder}/`);
}
