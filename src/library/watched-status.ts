import { App, TFile } from 'obsidian';
import { isInFolder, libraryPaths } from '../core/paths';
import { MEDIA_TYPES } from '../media/types';
import type { WatchlistNotesSettings } from '../settings';

/** A note in the Movies, TV Shows, or Anime folder (or one of their subfolders). */
export function isWatchNote(file: TFile | null, settings: WatchlistNotesSettings): file is TFile {
	if (!file || file.extension !== 'md') return false;
	const { folders } = libraryPaths(settings);
	return MEDIA_TYPES.some((type) => isInFolder(file.path, folders[type]));
}

/**
 * Flip the note's `watched` property (a missing one counts as unwatched). Only
 * that property changes; Obsidian rewrites the frontmatter safely.
 */
export async function toggleWatched(app: App, file: TFile): Promise<boolean> {
	let watched = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		watched = frontmatter.watched !== true;
		frontmatter.watched = watched;
	});
	return watched;
}
