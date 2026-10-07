import { App, Notice, TFile } from 'obsidian';
import { MediaErrorKind, toMediaError } from '../core/errors';
import { ensureFolder, joinPath, notesIn } from '../core/notes';
import { isInFolder, libraryPaths } from '../core/paths';
import { downloadPoster } from '../core/posters';
import type { TemplateValue } from '../core/render';
import { asString, localDate } from '../core/utils';
import type WatchlistNotesPlugin from '../main';
import { posterBaseName } from '../media/create-note';
import { buildVariables, displayTitle } from '../media/templates';
import { MEDIA_TYPES, MediaType } from '../media/types';
import { tmdb } from '../sources/tmdb';
import { emptyTitle, Title } from '../sources/types';
import { askChoice, Choice } from '../ui/choice-modal';

// TMDB's API terms don't allow keeping its data for more than 6 months. Notes made from TMDB are
// "due" a month before that; "Refresh TMDB notes" downloads their details and posters again.
// Nothing happens on its own: the user is reminded and asked first (DESIGN.md §12).
const DUE_AFTER_MONTHS = 5;
const TMDB_ADDRESS = /^https:\/\/www\.themoviedb\.org\/(movie|tv)\/(\d+)/;

/**
 * The properties a refresh may update, per type, and the template variable
 * each one comes from. Only properties a note already has are updated; the
 * note's name, title, watched, rating, tags, link, created, its other
 * properties, and its text never change.
 */
const REFRESHED: Record<MediaType, Record<string, string>> = {
	movie: {
		originalTitle: 'originalTitle',
		year: 'year',
		releaseDate: 'releaseDate',
		director: 'director',
		cast: 'cast',
		genre: 'genre',
		runtime: 'runtime',
		score: 'score',
		description: 'description',
		cover: 'coverUrl',
	},
	tv: {
		year: 'year',
		firstAired: 'firstAired',
		lastAired: 'lastAired',
		status: 'status',
		creator: 'creator',
		network: 'network',
		seasons: 'seasons',
		episodes: 'episodes',
		cast: 'cast',
		genre: 'genre',
		score: 'score',
		description: 'description',
		cover: 'coverUrl',
	},
	anime: {
		englishTitle: 'englishTitle',
		japaneseTitle: 'japaneseTitle',
		format: 'format',
		year: 'year',
		episodes: 'episodes',
		status: 'status',
		firstAired: 'firstAired',
		lastAired: 'lastAired',
		studio: 'studio',
		genre: 'genre',
		score: 'score',
		description: 'description',
		cover: 'coverUrl',
	},
};

export interface TmdbNote {
	file: TFile;
	type: MediaType;
	kind: 'movie' | 'tv';
	id: string;
	/** When its TMDB data was last downloaded: `sourceUpdated`, else `created`, else the file's creation time. */
	updated: Date;
}

/**
 * Notes in the movies, TV shows, and anime folders whose `sourceUrl` is a
 * TMDB address, and notes that say they're from TMDB but have no address
 * (they can't be refreshed).
 */
export function findTmdbNotes(plugin: WatchlistNotesPlugin): { notes: TmdbNote[]; withoutAddress: TFile[] } {
	const { app } = plugin;
	const { folders } = libraryPaths(plugin.settings);
	const notes: TmdbNote[] = [];
	const withoutAddress: TFile[] = [];
	for (const type of MEDIA_TYPES) {
		for (const file of notesIn(app, folders[type])) {
			const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			const match = TMDB_ADDRESS.exec(asString(frontmatter.sourceUrl));
			if (match?.[1] && match[2]) {
				notes.push({ file, type, kind: match[1] === 'tv' ? 'tv' : 'movie', id: match[2], updated: lastUpdated(frontmatter, file) });
			} else if (asString(frontmatter.source) === tmdb.name) {
				withoutAddress.push(file);
			}
		}
	}
	return { notes, withoutAddress };
}

export function isDue(note: TmdbNote, now = new Date()): boolean {
	const limit = new Date(now);
	limit.setMonth(limit.getMonth() - DUE_AFTER_MONTHS);
	return note.updated < limit;
}

function lastUpdated(frontmatter: Record<string, unknown>, file: TFile): Date {
	return toDate(frontmatter.sourceUpdated) ?? toDate(frontmatter.created) ?? new Date(file.stat.ctime);
}

/** A date from a property: "2026-10-06", "2026-10-06 12:00:00", or a date YAML already parsed. */
function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asString(value));
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** What the TMDB settings show about due notes. */
export function refreshStatus(plugin: WatchlistNotesPlugin): string {
	const { notes } = findTmdbNotes(plugin);
	if (notes.length === 0) return 'No notes from TMDB yet. TMDB’s terms allow keeping its data for up to 6 months; notes from TMDB are due for a refresh after 5.';
	const due = notes.filter((note) => isDue(note)).length;
	const notesWord = notes.length === 1 ? 'note' : 'notes';
	return due
		? `${due} of your ${notes.length} ${notesWord} from TMDB ${due === 1 ? 'was' : 'were'} last updated more than 5 months ago. TMDB’s terms allow keeping its data for up to 6 months; refreshing downloads it again.`
		: `Your ${notes.length} ${notesWord} from TMDB ${notes.length === 1 ? 'is' : 'are'} up to date (due for a refresh after 5 months; TMDB allows 6).`;
}

let reminded = false;

/** Once per session, when notes from TMDB are due, say so. Called when the plugin's commands run. */
export function remindIfDue(plugin: WatchlistNotesPlugin): void {
	if (reminded) return;
	const due = findTmdbNotes(plugin).notes.filter((note) => isDue(note)).length;
	if (due === 0) return;
	reminded = true;
	new Notice(
		`${due} ${due === 1 ? 'note' : 'notes'} from TMDB ${due === 1 ? 'is' : 'are'} due for a refresh (TMDB allows keeping its data for up to 6 months). Run "Refresh TMDB notes".`,
		15_000,
	);
}

/** For tests: forget that the reminder was shown. */
export function resetReminder(): void {
	reminded = false;
}

// Problems that would make every remaining note fail the same way: stop and say why.
const STOPPING: MediaErrorKind[] = ['offline', 'auth', 'config', 'rate-limited', 'network', 'timeout'];

interface Report {
	refreshed: number;
	gone: string[];
	noPoster: string[];
	failed: string[];
	stopped?: string;
}

/** Ask, then refresh the due notes (or all notes) from TMDB, and report what happened. */
export async function refreshTmdbNotes(plugin: WatchlistNotesPlugin): Promise<void> {
	const { app } = plugin;
	const { notes, withoutAddress } = findTmdbNotes(plugin);
	if (notes.length === 0) {
		new Notice(withoutAddress.length ? cannotRefresh(withoutAddress) : 'There are no notes from TMDB to refresh.', 10_000);
		return;
	}
	if (!tmdb.isConfigured(plugin)) {
		new Notice(`Refreshing needs your ${tmdb.name} key. Add it in Settings → Watchlist Notes → ${tmdb.name}.`, 10_000);
		return;
	}

	const due = notes.filter((note) => isDue(note));
	const choices: Choice<'due' | 'all' | null>[] = [
		...(due.length ? [{ label: `Refresh ${due.length} due`, value: 'due' as const, cta: true }] : []),
		{ label: `Refresh all ${notes.length}`, value: 'all', cta: due.length === 0 },
		{ label: 'Cancel', value: null },
	];
	const message =
		`${notes.length} ${notes.length === 1 ? 'note' : 'notes'} came from TMDB; ${due.length} ${due.length === 1 ? 'was' : 'were'} last updated more than 5 months ago. TMDB’s terms allow keeping its data for up to 6 months.\n\n` +
		'Refreshing downloads each note’s details and poster again, replaces its poster file, and updates the TMDB properties the note has (such as year, director, cast, genre, score, description). ' +
		'The note’s name and title, watched, rating, your other properties, and your text don’t change. Nothing is deleted.' +
		(withoutAddress.length ? `\n\n${cannotRefresh(withoutAddress)}` : '');
	const choice = await askChoice(app, 'Refresh TMDB notes', message, choices);
	if (!choice) return;

	const list = choice === 'due' ? due : notes;
	const report: Report = { refreshed: 0, gone: [], noPoster: [], failed: [] };
	const progress = new Notice(`Refreshing notes from TMDB… 0 of ${list.length}`, 0);
	try {
		for (const [index, note] of list.entries()) {
			progress.setMessage(`Refreshing notes from TMDB… ${index + 1} of ${list.length}`);
			try {
				const posterFound = await refreshNote(plugin, note);
				report.refreshed++;
				if (!posterFound) report.noPoster.push(note.file.basename);
			} catch (err) {
				const error = toMediaError(err);
				if (error.kind === 'not-found') {
					report.gone.push(note.file.basename);
				} else if (STOPPING.includes(error.kind)) {
					report.stopped = error.message;
					break;
				} else {
					report.failed.push(`${note.file.basename} (${error.message})`);
				}
			}
		}
	} finally {
		progress.hide();
	}
	new Notice(summary(report), 20_000);
}

function cannotRefresh(files: TFile[]): string {
	const names = files.map((file) => file.basename).join(', ');
	return `${files.length === 1 ? 'This note says it’s' : 'These notes say they’re'} from TMDB but ${files.length === 1 ? 'has' : 'have'} no TMDB address in sourceUrl, so ${files.length === 1 ? 'it' : 'they'} can’t be refreshed: ${names}.`;
}

function summary(report: Report): string {
	const lines = [`Refreshed ${report.refreshed} ${report.refreshed === 1 ? 'note' : 'notes'} from TMDB.`];
	if (report.stopped) lines.push(`Stopped: ${report.stopped}`);
	if (report.gone.length) lines.push(`No longer on TMDB (left as they are): ${report.gone.join(', ')}.`);
	if (report.noPoster.length) lines.push(`TMDB has no poster for: ${report.noPoster.join(', ')}. The old poster was kept; delete it if you like.`);
	if (report.failed.length) lines.push(`Couldn't refresh: ${report.failed.join('; ')}.`);
	return lines.join('\n');
}

/** Refresh one note. Resolves with whether TMDB still has a poster for it. */
async function refreshNote(plugin: WatchlistNotesPlugin, note: TmdbNote): Promise<boolean> {
	const { app, settings } = plugin;
	const title = await tmdb.details(
		{ title: emptyTitle(note.type, { id: 'tmdb', name: tmdb.name, url: '', key: '' }), thumbnailUrl: '', ref: { id: note.id, kind: note.kind } },
		plugin,
	);
	const frontmatter = app.metadataCache.getFileCache(note.file)?.frontmatter ?? {};
	const poster = 'localCover' in frontmatter ? await refreshPoster(plugin, note, title, asString(frontmatter.localCover)) : { found: true };
	const variables = buildVariables(title, { noteTitle: displayTitle(title, settings.animeTitle), posterPath: null, libraryNoteName: '' });

	await app.fileManager.processFrontMatter(note.file, (front: Record<string, unknown>) => {
		for (const [property, variable] of Object.entries(REFRESHED[note.type])) {
			if (property in front) front[property] = propertyValue(variables[variable]);
		}
		if (poster.newLink) front.localCover = poster.newLink;
		front.sourceUpdated = localDate(new Date());
	});
	return poster.found;
}

/** A template value as a property: empty text or list → empty property. */
function propertyValue(value: TemplateValue | undefined): unknown {
	if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
	return value;
}

/**
 * Download the poster again and replace the file the note links to (only if
 * it's in the posters folder). Otherwise save it under the usual name and
 * link it. If TMDB has no poster any more, the old file is kept.
 */
async function refreshPoster(
	plugin: WatchlistNotesPlugin,
	note: TmdbNote,
	title: Title,
	localCover: string,
): Promise<{ found: boolean; newLink?: string }> {
	const { app, settings } = plugin;
	if (!title.posterDownloadUrl) return { found: false };
	const image = await downloadPoster(title.posterDownloadUrl, tmdb.name);
	if (!image) return { found: false };

	const { posters } = libraryPaths(settings);
	const current = linkedFile(app, localCover, note.file.path);
	if (current && isInFolder(current.path, posters) && current.extension === image.extension) {
		await app.vault.modifyBinary(current, image.data);
		return { found: true };
	}
	const path = joinPath(posters, `${posterBaseName(displayTitle(title, settings.animeTitle), title)}.${image.extension}`);
	const existing = app.vault.getFileByPath(path);
	if (existing) {
		await app.vault.modifyBinary(existing, image.data);
	} else {
		await ensureFolder(app, posters);
		await app.vault.createBinary(path, image.data);
	}
	return { found: true, newLink: `[[${path}]]` };
}

/** The file a `localCover` value points to: "[[…]]", "![[…]]", "[[…|alias]]", or a plain path. */
function linkedFile(app: App, value: string, sourcePath: string): TFile | null {
	const path = value.replace(/^!?\[\[|\|.*$|\]\]$|^\//g, '').trim();
	if (!path) return null;
	const cache = app.metadataCache as Partial<App['metadataCache']>;
	return app.vault.getFileByPath(path) ?? (typeof cache.getFirstLinkpathDest === 'function' ? cache.getFirstLinkpathDest(path, sourcePath) : null);
}
