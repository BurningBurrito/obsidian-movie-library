import { App, Notice, TFile } from 'obsidian';
import { canOpenSettings, openPluginSettings } from '../core/app';
import { toMediaError } from '../core/errors';
import { ensureFolder, findNoteByName, loadTemplate, nextFreePath, notePath, openNote, safeFileName } from '../core/notes';
import { libraryPaths } from '../core/paths';
import { downloadPoster, savePoster } from '../core/posters';
import { renderTemplate } from '../core/render';
import { ensureLibraryNote } from '../library/moc';
import type WatchlistNotesPlugin from '../main';
import { TYPE_SETTINGS } from '../settings';
import { configuredSources, searchTitles, SearchOutcome } from '../sources';
import type { MediaSource, SearchResult, Title } from '../sources/types';
import { askChoice } from '../ui/choice-modal';
import { pickItem } from '../ui/pick-modal';
import { openSearchModal } from '../ui/search-modal';
import { BUILT_IN_TEMPLATES, buildVariables, displayTitle } from './templates';
import { MEDIA_WORDS, MediaType } from './types';

/** README section on getting a key (see the README's headings). */
export const KEY_HELP_URL = 'https://github.com/BurningBurrito/obsidian-movie-library#getting-a-tmdb-key';

const PLACEHOLDERS: Record<MediaType, string> = {
	movie: 'Title, Title (year), or IMDb ID',
	tv: 'Title, Title (year), or IMDb ID',
	anime: 'Title (English or romaji) or MyAnimeList link',
};

/** Search → pick → (existing note?) → details → poster → note from the template. */
export async function createTitleNote(plugin: WatchlistNotesPlugin, type: MediaType): Promise<void> {
	const { app, settings } = plugin;
	const words = MEDIA_WORDS[type];
	const sources = configuredSources(plugin, type);
	if (sources.length === 0) {
		await explainMissingSource(plugin, type);
		return;
	}

	const outcome = await openSearchModal<SearchOutcome>(
		app,
		{
			title: `Search for ${words.a}`,
			placeholder: PLACEHOLDERS[type],
			emptyMessage: `Type the ${words.one}'s title.`,
			initialQuery: selectedText(app),
			modes: sources.map((source) => ({ id: source.id, label: source.name })),
			initialMode: settings[TYPE_SETTINGS[type].source],
		},
		(query, mode, progress) => searchTitles(query, type, plugin, mode, progress),
	);
	if (!outcome) return;
	if (outcome.fallback) {
		new Notice(`${outcome.fallback.reason}\nShowing results from ${outcome.source.name} instead.`, 8000);
	}

	const result = outcome.results.length === 1 ? outcome.results[0] : await pickTitle(app, outcome);
	if (!result) return;

	// Check for an existing note before asking the source for more. Small
	// differences (capitals, ' vs ’) still count as the same title.
	const paths = libraryPaths(settings);
	const folder = paths.folders[type];
	const noteTitle = displayTitle(result.title, settings.animeTitle);
	const baseName = safeFileName(noteTitle, `Untitled ${words.one}`);
	let path = notePath(folder, baseName);
	const existing = findNoteByName(app, folder, baseName, true);
	if (existing) {
		const existingYear = noteYear(app, existing);
		const newYear = result.title.year;
		const choice = await askChoice(
			app,
			`This ${words.one} already has a note`,
			`"${existing.path}"${existingYear ? ` (${existingYear})` : ''} already exists. Open it, or create a second note for "${noteTitle}"${newYear ? ` (${newYear})` : ''}?`,
			[
				{ label: 'Open existing', value: 'open' as const, cta: true },
				{ label: 'Create copy', value: 'copy' as const },
				{ label: 'Cancel', value: null },
			],
		);
		if (choice === 'open') await openNote(app, existing);
		if (choice !== 'copy') return;
		path = copyPath(app, folder, baseName, newYear);
	}

	const working = new Notice(`Getting details for "${noteTitle}"…`, 0);
	try {
		const title = await withDetails(plugin, outcome.source, result);
		await ensureFolder(app, folder);
		const libraryNote = await ensureLibraryNote(plugin);
		const posterPath = await savePosterFor(plugin, outcome.source, title, noteTitle, paths.posters);

		const templateFile = settings[TYPE_SETTINGS[type].template];
		const { template, missing } = await loadTemplate(app, templateFile, BUILT_IN_TEMPLATES[type]);
		if (missing) new Notice(`Template "${templateFile}" was not found, so the built-in template was used.`);
		const content = renderTemplate(template, buildVariables(title, { noteTitle, posterPath, libraryNoteName: libraryNote.basename }));
		const file = await app.vault.create(path, content);
		working.hide();
		if (settings.openAfterCreate) await openNote(app, file);
		else new Notice(`Created "${file.path}".`);
	} catch (err) {
		working.hide();
		new Notice(`Could not create the note for "${noteTitle}": ${toMediaError(err).message}`, 10_000);
	}
}

/** "Dune (2021).md" when the year is known and free (so a remake doesn't look like a sequel), else "Dune 2.md". */
export function copyPath(app: App, folder: string, baseName: string, year: number | null): string {
	if (year !== null && !baseName.endsWith(`(${year})`)) {
		const withYear = notePath(folder, `${baseName} (${year})`);
		if (!app.vault.getAbstractFileByPath(withYear)) return withYear;
	}
	return nextFreePath(app, folder, baseName);
}

/** The `year` property of an existing note, if it has one. */
function noteYear(app: App, file: TFile): string {
	const year: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.year;
	return typeof year === 'number' || typeof year === 'string' ? String(year) : '';
}

/** The search result with its details; if those can't be fetched, what the search found. */
async function withDetails(plugin: WatchlistNotesPlugin, source: MediaSource, result: SearchResult): Promise<Title> {
	try {
		return await source.details(result, plugin);
	} catch (err) {
		new Notice(
			`Couldn't get all the details from ${source.name} (${toMediaError(err).message}) The note uses what the search found.`,
			8000,
		);
		return result.title;
	}
}

/** Download and save the poster. Returns its vault path, or null when there's none (the note is still created). */
async function savePosterFor(
	plugin: WatchlistNotesPlugin,
	source: MediaSource,
	title: Title,
	noteTitle: string,
	postersFolder: string,
): Promise<string | null> {
	const url = title.posterDownloadUrl;
	if (!url) {
		new Notice(`${source.name} has no poster for "${noteTitle}".`);
		return null;
	}
	try {
		const image = await downloadPoster(url, source.name);
		if (!image) {
			new Notice(`${source.name} has no poster for "${noteTitle}".`);
			return null;
		}
		const file = await savePoster(plugin.app, postersFolder, posterBaseName(noteTitle, title), image);
		return file.path;
	} catch (err) {
		new Notice(`Couldn't save the poster (${toMediaError(err).message}) The note was created without it.`, 8000);
		return null;
	}
}

/** "Inception (2010) - tmdb-movie-27205": title, year, and the source's ID, so two titles never share a poster. */
export function posterBaseName(noteTitle: string, title: Title): string {
	const year = title.year ? ` (${title.year})` : '';
	return `${safeFileName(noteTitle, 'Poster', 80)}${year} - ${safeFileName(title.source.key, 'poster')}`;
}

/** With no source set up for this type (movies without a key), explain instead of failing. */
async function explainMissingSource(plugin: WatchlistNotesPlugin, type: MediaType): Promise<void> {
	const { app } = plugin;
	const words = MEDIA_WORDS[type];
	const choice = await askChoice(
		app,
		`${words.label} search needs a key`,
		`${words.label} search needs a free TMDB or OMDb API key. Add one in Settings → Watchlist Notes.\n\nTV shows and anime work without a key.`,
		[
			...(canOpenSettings(app) ? [{ label: 'Open settings', value: 'settings' as const, cta: true }] : []),
			{ label: 'How to get a key', value: 'help' as const },
			{ label: 'Close', value: null },
		],
	);
	if (choice === 'settings') openPluginSettings(app, plugin.manifest.id);
	if (choice === 'help') window.open(KEY_HELP_URL);
}

function pickTitle(app: App, outcome: SearchOutcome): Promise<SearchResult | null> {
	return pickItem(app, {
		items: outcome.results,
		// Say it where the user is looking when another source answered than the one they chose.
		placeholder: `${outcome.results.length} results from ${outcome.source.name}${outcome.fallback ? ` (instead of ${outcome.fallback.from})` : ''}. Type to filter.`,
		emptyText: 'No result matches what you typed.',
		matches: ({ title }, query) =>
			[title.title, title.originalTitle, title.englishTitle, title.romajiTitle, title.japaneseTitle, title.network, ...title.studios].some(
				(text) => text.toLowerCase().includes(query),
			),
		render: ({ title, thumbnailUrl }, el) => {
			el.addClass('watchlist-notes-result');
			const poster = el.createDiv({ cls: 'watchlist-notes-result-poster' });
			if (thumbnailUrl) poster.createEl('img', { attr: { src: thumbnailUrl, alt: '', loading: 'lazy' } });
			const text = el.createDiv({ cls: 'watchlist-notes-result-text' });
			text.createDiv({ cls: 'watchlist-notes-result-title', text: title.title });
			const details = resultDetails(title);
			if (details) text.createDiv({ cls: 'watchlist-notes-result-details', text: details });
		},
	});
}

/** The line under each result: movies "2010 · original title"; TV "2022 · Apple TV · Running"; anime "2023 · TV · 28 episodes · Madhouse". */
export function resultDetails(title: Title): string {
	const year = title.year ? String(title.year) : '';
	const parts =
		title.type === 'movie'
			? [year, title.originalTitle !== title.title ? title.originalTitle : '']
			: title.type === 'tv'
				? [year, title.network, title.status]
				: [year, title.format, title.episodes ? `${title.episodes} episode${title.episodes === 1 ? '' : 's'}` : '', title.studios[0] ?? ''];
	return parts.filter(Boolean).join(' · ');
}

/** The selected text in the active editor, if it looks like a title or link. */
function selectedText(app: App): string {
	const selection = app.workspace.activeEditor?.editor?.getSelection().trim() ?? '';
	return selection.length <= 120 && !selection.includes('\n') ? selection : '';
}
