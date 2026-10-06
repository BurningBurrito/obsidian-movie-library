import { Notice, TFile } from 'obsidian';
import { dataviewMessage, dataviewStatus } from '../core/dataview';
import { MediaError } from '../core/errors';
import { ensureFolder, findNoteByName } from '../core/notes';
import { libraryPaths } from '../core/paths';
import type WatchlistNotesPlugin from '../main';
import { MEDIA_HEADINGS, MEDIA_TYPES, MediaType } from '../media/types';
import type { AnimeTitle, WatchlistNotesSettings } from '../settings';
import { askChoice, Choice } from '../ui/choice-modal';

/** Notes with this class use the full pane width (see styles.css). */
export const LIBRARY_NOTE_CLASS = 'watchlist-notes-moc';

const START_PREFIX = '%% watchlist-notes:start';
const START_LINE = `${START_PREFIX} (generated: "Regenerate library note" replaces only the part between these markers) %%`;
const END_LINE = '%% watchlist-notes:end %%';

// The poster column accepts every form an image can be stored in: a link
// ("[[…]]"), an embed ("![[…]]"), a link with "|alias", or a plain path such
// as "/Poster.jpg". Every function used accepts any value, so no row can make
// the expression fail (Dataview silently drops rows that do).
const POSTER_COLUMN = String.raw`choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Poster`;

// The anime title property each "Anime title" setting shows, falling back to `title`.
const ANIME_TITLE_PROPERTY: Record<AnimeTitle, string> = {
	english: 'englishTitle',
	romaji: 'romajiTitle',
	japanese: 'japaneseTitle',
};

// Columns between Year and Genre, which differ by type.
const MIDDLE_COLUMNS: Record<MediaType, string[]> = {
	movie: ['director AS Director'],
	tv: ['creator AS Creator'],
	anime: ['format AS Format', 'studio AS Studio'],
};

/** The Dataview query for one type's table, reading notes from that type's folder. */
export function tableQuery(type: MediaType, folder: string, animeTitle: AnimeTitle): string {
	// default() takes two values, so fallbacks are nested.
	const title =
		type === 'anime'
			? `default(${ANIME_TITLE_PROPERTY[animeTitle]}, default(title, file.name))`
			: 'default(title, file.name)';
	const from = folder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return [
		'```dataview',
		'TABLE WITHOUT ID',
		`  ${POSTER_COLUMN},`,
		`  ${title} AS Title,`,
		'  year AS Year,',
		...MIDDLE_COLUMNS[type].map((column) => `  ${column},`),
		'  genre AS Genre,',
		'  file.link AS Note,',
		'  choice(watched, "🟩", "🟥") AS Watched',
		`FROM "${from}"`,
		`SORT ${title} ASC`,
		'```',
	].join('\n');
}

/** The three tables, each under its heading, between the markers. */
export function generatedBlock(settings: WatchlistNotesSettings): string {
	const { folders } = libraryPaths(settings);
	const tables = MEDIA_TYPES.map(
		(type) => `## ${MEDIA_HEADINGS[type]}\n\n${tableQuery(type, folders[type], settings.animeTitle)}`,
	);
	return `${START_LINE}\n${tables.join('\n\n')}\n${END_LINE}`;
}

export function newLibraryNote(settings: WatchlistNotesSettings): string {
	return `---\ncssclasses:\n  - ${LIBRARY_NOTE_CLASS}\n---\n# Watch Library\n\n${generatedBlock(settings)}\n`;
}

export type RegenerationPlan =
	/** The note has our markers: replace what's between them. */
	| { kind: 'markers'; start: number; end: number }
	/** No markers, but exactly one Dataview table (e.g. a library note made by hand). */
	| { kind: 'single-table'; start: number; end: number }
	/** No markers and no single table to replace: add at the end. */
	| { kind: 'append' };

// A ```dataview (or ~~~dataview) code block, not dataviewjs.
const DATAVIEW_BLOCK = /^(`{3,}|~{3,})[ \t]*dataview[ \t]*\r?\n[\s\S]*?\r?\n\1[ \t]*$/gm;

export function planRegeneration(content: string): RegenerationPlan {
	const start = content.search(new RegExp(`^${escapeRegExp(START_PREFIX)}`, 'm'));
	if (start >= 0) {
		const endIndex = content.indexOf(END_LINE, start);
		if (endIndex >= 0) return { kind: 'markers', start, end: endIndex + END_LINE.length };
	}
	const tables = Array.from(content.matchAll(DATAVIEW_BLOCK));
	const only = tables[0];
	if (tables.length === 1 && only?.index !== undefined) {
		return { kind: 'single-table', start: only.index, end: only.index + only[0].length };
	}
	return { kind: 'append' };
}

/** The note's new content. `replaceTable` decides what happens with a single hand-made table. */
export function applyRegeneration(content: string, plan: RegenerationPlan, block: string, replaceTable: boolean): string {
	if (plan.kind === 'markers' || (plan.kind === 'single-table' && replaceTable)) {
		return content.slice(0, plan.start) + block + content.slice(plan.end);
	}
	return `${content.trimEnd()}\n\n${block}\n`;
}

const toldAboutCapitals = new Set<string>();

/**
 * The library note, also when its name differs from the setting only in
 * capital letters (e.g. "Watch library MOC" vs "Watch Library MOC"), so a
 * second one is never created next to it.
 */
export function findLibraryNote(plugin: WatchlistNotesPlugin): TFile | null {
	const paths = libraryPaths(plugin.settings);
	const file = findNoteByName(plugin.app, paths.root, paths.libraryNoteName, false);
	if (file && file.basename !== paths.libraryNoteName && !toldAboutCapitals.has(file.path)) {
		toldAboutCapitals.add(file.path);
		new Notice(
			`Using "${file.path}" as the library note. Its name differs from the setting "${paths.libraryNoteName}" only in capital letters.`,
			10_000,
		);
	}
	return file;
}

/**
 * The library note, created if it doesn't exist yet. An existing note is
 * never changed here; that only happens through "Regenerate library note".
 */
export async function ensureLibraryNote(plugin: WatchlistNotesPlugin): Promise<TFile> {
	const { app } = plugin;
	const paths = libraryPaths(plugin.settings);
	const existing = findLibraryNote(plugin);
	if (existing) return existing;
	if (app.vault.getAbstractFileByPath(paths.libraryNote)) {
		throw new MediaError('config', `"${paths.libraryNote}" is a folder. Choose another library note name in the settings.`);
	}
	await ensureFolder(app, paths.root);
	const file = await app.vault.create(paths.libraryNote, newLibraryNote(plugin.settings));
	new Notice(`Created the library note "${paths.libraryNote}".`);
	warnIfNoDataview(plugin);
	return file;
}

type RegenerateChoice = 'regenerate' | 'replace' | 'append';

/** Rebuild (or add) the library tables, after the user confirms. Text outside them is kept. */
export async function regenerateLibraryNote(plugin: WatchlistNotesPlugin): Promise<void> {
	const { app } = plugin;
	const file = findLibraryNote(plugin);
	if (!file) {
		await ensureLibraryNote(plugin);
		return;
	}

	const plan = planRegeneration(await app.vault.read(file));
	const name = file.basename;
	const cancel: Choice<RegenerateChoice | null> = { label: 'Cancel', value: null };
	let message: string;
	let choices: Choice<RegenerateChoice | null>[];
	switch (plan.kind) {
		case 'markers':
			message = `This replaces the library tables in "${name}" with new ones built from your current settings. Everything else in the note stays as it is.`;
			choices = [{ label: 'Regenerate', value: 'regenerate', cta: true }, cancel];
			break;
		case 'single-table':
			message =
				`"${name}" already has a Dataview table that Watchlist Notes didn't create.\n\n` +
				'Replace it with the library tables? The old query is removed; your properties and any other text stay. ' +
				'Or add the library tables at the end and keep both.';
			choices = [
				{ label: 'Replace that table', value: 'replace', cta: true, destructive: true },
				{ label: 'Add at the end', value: 'append' },
				cancel,
			];
			break;
		case 'append':
			message = `"${name}" has no library tables yet. Add them at the end of the note? Nothing in the note is removed.`;
			choices = [{ label: 'Add the tables', value: 'append', cta: true }, cancel];
			break;
	}
	const choice = await askChoice(app, 'Regenerate library note', message, choices);
	if (!choice) return;

	const block = generatedBlock(plugin.settings);
	// Plan again on the current text, in case the note changed while the window was open.
	await app.vault.process(file, (data) => applyRegeneration(data, planRegeneration(data), block, choice === 'replace'));
	await addLibraryClass(plugin, file);
	new Notice(`Updated the library note "${file.path}".`);
	warnIfNoDataview(plugin);
}

/** Add the full-width class to the note's cssclasses, keeping any it already has. */
async function addLibraryClass(plugin: WatchlistNotesPlugin, file: TFile): Promise<void> {
	await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		const current = frontmatter.cssclasses;
		const classes = Array.isArray(current) ? current.map(String) : typeof current === 'string' && current ? [current] : [];
		if (!classes.includes(LIBRARY_NOTE_CLASS)) frontmatter.cssclasses = [...classes, LIBRARY_NOTE_CLASS];
	});
}

export function warnIfNoDataview(plugin: WatchlistNotesPlugin): void {
	const message = dataviewMessage(dataviewStatus(plugin.app), libraryPaths(plugin.settings).libraryNoteName);
	if (message) new Notice(message, 15_000);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
