import { App, Notice, PluginSettingTab, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { dataviewMessage, dataviewStatus } from './core/dataview';
import { toMediaError } from './core/errors';
import { normalizeFolder } from './core/notes';
import { libraryPaths } from './core/paths';
import { regenerateLibraryNote } from './library/moc';
import type WatchlistNotesPlugin from './main';

/** Which title names anime notes and the anime table. */
export type AnimeTitle = 'english' | 'romaji' | 'japanese';

export interface WatchlistNotesSettings {
	/** Holds the library note and the type and poster folders. May be nested ("Synced Notes/Watch Library"). */
	libraryFolder: string;
	/** Inside the library folder. */
	moviesFolder: string;
	/** Inside the library folder. */
	tvFolder: string;
	/** Inside the library folder; anime series and films. */
	animeFolder: string;
	/** Inside the library folder. */
	postersFolder: string;
	/** The overview note, without ".md". */
	libraryNoteName: string;
	openAfterCreate: boolean;
	animeTitle: AnimeTitle;
}

export const DEFAULT_SETTINGS: WatchlistNotesSettings = {
	libraryFolder: 'Watch Library',
	moviesFolder: 'Movies',
	tvFolder: 'TV Shows',
	animeFolder: 'Anime',
	postersFolder: 'Posters',
	libraryNoteName: 'Watch Library MOC',
	openAfterCreate: true,
	animeTitle: 'english',
};

const ANIME_TITLES: Record<AnimeTitle, string> = { english: 'English', romaji: 'Romaji', japanese: 'Japanese' };

// The folders inside the library folder; each needs its own.
const FOLDER_KEYS = ['moviesFolder', 'tvFolder', 'animeFolder', 'postersFolder'] as const;
type FolderKey = (typeof FOLDER_KEYS)[number];

// Characters that can't be in a file or folder name, or that break links.
const BAD_NAME_CHARS = /[\\:*?"<>|#^[\]]/;

/** Merge saved data with defaults and repair values the settings page would reject. */
export function sanitizeSettings(saved: Partial<WatchlistNotesSettings> | null): WatchlistNotesSettings {
	const settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	for (const key of [...FOLDER_KEYS, 'libraryNoteName'] as const) {
		if (folderProblem(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
	}
	if (!(settings.animeTitle in ANIME_TITLES)) settings.animeTitle = DEFAULT_SETTINGS.animeTitle;
	return settings;
}

/** Why a subfolder or note name can't be used, or undefined if it's fine. */
function folderProblem(value: string): string | undefined {
	const text = value.trim();
	if (!text) return 'This can’t be empty.';
	if (BAD_NAME_CHARS.test(text)) return 'Remove these characters: \\ : * ? " < > | # ^ [ ]';
	if (text.split('/').some((part) => part === '..' || part === '.')) return 'Use a folder name, not "." or "..".';
	return undefined;
}

/**
 * Why this folder can't be used next to the other folders, or undefined.
 * Movies, TV shows, anime, and posters need separate folders, or one table
 * would list another type's notes.
 */
export function folderClash(settings: WatchlistNotesSettings, key: FolderKey, value: string): string | undefined {
	const mine = normalizeFolder(value).toLowerCase();
	for (const other of FOLDER_KEYS) {
		if (other === key) continue;
		const theirs = normalizeFolder(settings[other]).toLowerCase();
		if (mine === theirs || mine.startsWith(`${theirs}/`) || theirs.startsWith(`${mine}/`)) {
			return 'Movies, TV shows, anime, and posters each need their own folder, not the same one or one inside another.';
		}
	}
	return undefined;
}

type SettingKey = keyof WatchlistNotesSettings;

// Declarative settings (Obsidian 1.13+): Obsidian renders these, saves changes
// to plugin.settings, and includes them in the settings search.
export class WatchlistNotesSettingTab extends PluginSettingTab {
	plugin: WatchlistNotesPlugin;

	constructor(app: App, plugin: WatchlistNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{ type: 'group', items: this.generalItems() },
			{ type: 'group', heading: 'Library note', items: this.libraryNoteItems() },
			{ type: 'group', heading: 'Sources', items: this.sourceItems() },
		];
	}

	private generalItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'Library folder',
				desc: 'Holds the library note and the movies, TV shows, anime, and posters folders. It can be inside another folder. Created if it doesn’t exist.',
				control: {
					type: 'folder',
					key: 'libraryFolder',
					placeholder: DEFAULT_SETTINGS.libraryFolder,
					defaultValue: DEFAULT_SETTINGS.libraryFolder,
				},
			},
			this.folderItem('moviesFolder', 'Movies folder', 'Inside the library folder. One note per movie.'),
			this.folderItem('tvFolder', 'TV shows folder', 'Inside the library folder. One note per TV show.'),
			this.folderItem('animeFolder', 'Anime folder', 'Inside the library folder. One note per anime series or film.'),
			this.folderItem('postersFolder', 'Posters folder', 'Inside the library folder. Posters are saved here.'),
			{
				name: 'Open note after creating it',
				control: { type: 'toggle', key: 'openAfterCreate' },
			},
		];
	}

	private folderItem(key: FolderKey, name: string, desc: string): SettingGroupItem<SettingKey> {
		return {
			name,
			desc,
			control: {
				type: 'text',
				key,
				placeholder: DEFAULT_SETTINGS[key],
				validate: (value) => folderProblem(value) ?? folderClash(this.plugin.settings, key, value),
			},
		};
	}

	private libraryNoteItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'Library note name',
				desc: 'The overview note in the library folder, with tables of your movies, TV shows, and anime. It’s created on first use and never overwritten.',
				control: {
					type: 'text',
					key: 'libraryNoteName',
					placeholder: DEFAULT_SETTINGS.libraryNoteName,
					validate: (value) => (value.includes('/') ? 'Use a name, not a path.' : folderProblem(value)),
				},
			},
			{
				name: 'Dataview',
				render: (setting) => {
					const status = dataviewStatus(this.app);
					setting.setDesc(
						dataviewMessage(status, libraryPaths(this.plugin.settings).libraryNoteName) ??
							(status === 'enabled'
								? 'Installed and enabled. The library tables will show.'
								: 'The library tables need the Dataview plugin.'),
					);
				},
			},
			{
				name: 'Regenerate library note',
				desc: 'Rebuild the tables from the current settings, or add them to a library note you made yourself. You confirm first; nothing else in the note changes.',
				action: () => void this.run(() => regenerateLibraryNote(this.plugin)),
			},
		];
	}

	private sourceItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'Anime title',
				desc: 'Which title names anime notes and the anime table. English and Japanese fall back to the romaji title when there’s none. After changing it, regenerate the library note to update the table; existing note names don’t change.',
				control: { type: 'dropdown', key: 'animeTitle', options: ANIME_TITLES },
			},
		];
	}

	private async run(task: () => Promise<void>): Promise<void> {
		try {
			await task();
		} catch (err) {
			new Notice(toMediaError(err).message, 10_000);
		}
	}
}
