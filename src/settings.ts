import { App, Notice, PluginSettingTab, SecretComponent, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import tmdbLogo from '../assets/tmdb-logo.svg';
import { dataviewMessage, dataviewStatus } from './core/dataview';
import { toMediaError } from './core/errors';
import { ensureFolder, normalizeFolder } from './core/notes';
import { libraryPaths } from './core/paths';
import { regenerateLibraryNote } from './library/moc';
import { refreshStatus, refreshTmdbNotes } from './library/tmdb-refresh';
import type WatchlistNotesPlugin from './main';
import { BUILT_IN_TEMPLATES, TEMPLATE_COPY_PATHS } from './media/templates';
import { MEDIA_TYPES, MEDIA_WORDS, MediaType } from './media/types';
import { configuredSources, getSource, SOURCE_ORDER, SOURCES } from './sources';
import { jikan, MYANIMELIST, tenrai } from './sources/myanimelist';
import { omdb } from './sources/omdb';
import { tmdb } from './sources/tmdb';
import { tvmaze } from './sources/tvmaze';
import type { SourceId } from './sources/types';

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

	/** Template files; "" = the built-in template. */
	movieTemplate: string;
	tvTemplate: string;
	animeTemplate: string;

	/** Where searches go first, per type. */
	movieSource: SourceId;
	tvSource: SourceId;
	animeSource: SourceId;
	useFallback: boolean;
	/** Leave out titles rated for adults (MyAnimeList's R+ and Rx; TMDB's adult flag). */
	hideAdult: boolean;
	animeTitle: AnimeTitle;
	/** Two-letter code for TMDB's titles and descriptions; "" for TMDB's default. */
	language: string;

	/** Names of the secrets in Obsidian's keychain that hold the keys (not the keys themselves). */
	tmdbKeySecret: string;
	omdbKeySecret: string;
}

export const DEFAULT_SETTINGS: WatchlistNotesSettings = {
	libraryFolder: 'Watch Library',
	moviesFolder: 'Movies',
	tvFolder: 'TV Shows',
	animeFolder: 'Anime',
	postersFolder: 'Posters',
	libraryNoteName: 'Watch Library MOC',
	openAfterCreate: true,

	movieTemplate: '',
	tvTemplate: '',
	animeTemplate: '',

	movieSource: 'tmdb',
	tvSource: 'tvmaze',
	animeSource: 'tenrai',
	useFallback: true,
	hideAdult: true,
	animeTitle: 'english',
	language: 'en',

	tmdbKeySecret: '',
	omdbKeySecret: '',
};

/** The settings that belong to each type. */
export const TYPE_SETTINGS = {
	movie: { template: 'movieTemplate', source: 'movieSource' },
	tv: { template: 'tvTemplate', source: 'tvSource' },
	anime: { template: 'animeTemplate', source: 'animeSource' },
} as const satisfies Record<MediaType, { template: keyof WatchlistNotesSettings; source: keyof WatchlistNotesSettings }>;

const ANIME_TITLES: Record<AnimeTitle, string> = { english: 'English', romaji: 'Romaji', japanese: 'Japanese' };
const LANGUAGE_CODE = /^[a-z]{2}$/;

/** TMDB's attribution notice, worded as its API Terms of Use (§3) require. */
export const TMDB_NOTICE = 'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';

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
	for (const type of MEDIA_TYPES) {
		const key = TYPE_SETTINGS[type].source;
		if (!SOURCE_ORDER[type].includes(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
	}
	if (!(settings.animeTitle in ANIME_TITLES)) settings.animeTitle = DEFAULT_SETTINGS.animeTitle;
	if (settings.language && !LANGUAGE_CODE.test(settings.language)) settings.language = DEFAULT_SETTINGS.language;
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

/**
 * Save the built-in templates to "Templates/…" (skipping any that exist) and
 * select them. Returns what happened, for a notice.
 */
export async function createTemplateCopies(plugin: WatchlistNotesPlugin): Promise<string> {
	const created: string[] = [];
	const existing: string[] = [];
	for (const type of MEDIA_TYPES) {
		const path = TEMPLATE_COPY_PATHS[type];
		if (plugin.app.vault.getFileByPath(path)) {
			existing.push(path);
		} else {
			await ensureFolder(plugin.app, path.slice(0, path.lastIndexOf('/')));
			await plugin.app.vault.create(path, BUILT_IN_TEMPLATES[type]);
			created.push(path);
		}
		plugin.settings[TYPE_SETTINGS[type].template] = path;
	}
	await plugin.saveSettings();
	const parts = [];
	if (created.length) parts.push(`Created ${created.map((p) => `"${p}"`).join(', ')}. Edit them to change your notes.`);
	if (existing.length) parts.push(`${existing.map((p) => `"${p}"`).join(', ')} already existed and ${existing.length === 1 ? 'is' : 'are'} now used.`);
	return parts.join(' ');
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
			{ type: 'group', heading: 'Templates', items: this.templateItems() },
			{ type: 'group', heading: 'Sources', items: this.sourceItems() },
			{ type: 'group', heading: 'TMDB', items: this.tmdbItems() },
			{ type: 'group', heading: 'OMDb', items: this.omdbItems() },
			{ type: 'group', heading: 'Credits', items: this.creditItems() },
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

	private templateItems(): SettingGroupItem<SettingKey>[] {
		const fileItem = (type: MediaType): SettingGroupItem<SettingKey> => ({
			name: `${MEDIA_WORDS[type].label} template`,
			desc: 'Leave empty to use the built-in template. The README lists the available variables.',
			control: {
				type: 'file',
				key: TYPE_SETTINGS[type].template,
				placeholder: TEMPLATE_COPY_PATHS[type],
				filter: (file) => file.extension === 'md',
			},
		});
		return [
			fileItem('movie'),
			fileItem('tv'),
			fileItem('anime'),
			{
				name: 'Create editable templates',
				desc: `Save the built-in templates to the "${TEMPLATE_COPY_PATHS.movie.split('/')[0]}" folder and use them, so you can change them. Existing files aren't overwritten.`,
				action: () =>
					void this.run(async () => {
						new Notice(await createTemplateCopies(this.plugin));
						this.update();
					}),
			},
		];
	}

	private sourceItems(): SettingGroupItem<SettingKey>[] {
		const defaultSourceItem = (type: MediaType): SettingGroupItem<SettingKey> | null => {
			const sources = configuredSources(this.plugin, type);
			if (sources.length === 0) return null;
			return {
				name: `${MEDIA_WORDS[type].label}: default source`,
				desc: 'Where searches go first. You can switch in the search window.',
				control: {
					type: 'dropdown',
					key: TYPE_SETTINGS[type].source,
					options: Object.fromEntries(sources.map((source) => [source.id, source.name])),
				},
			};
		};
		const freeSources = SOURCES.filter((source) => !source.needsKey).map((source) => source.id);
		return [
			...MEDIA_TYPES.map(defaultSourceItem).filter((item): item is SettingGroupItem<SettingKey> => item !== null),
			{
				name: 'Try the next source if the default one fails or finds nothing',
				desc: 'Uses the other sources you’ve set up for that type, in order. A source that just failed is skipped for 10 minutes.',
				control: { type: 'toggle', key: 'useFallback' },
			},
			{
				name: 'Hide adult titles',
				desc: 'Leaves titles rated for adults out of search results (MyAnimeList’s R+ and Rx ratings). A MyAnimeList link always finds its anime.',
				control: { type: 'toggle', key: 'hideAdult' },
			},
			{
				name: 'Anime title',
				desc: 'Which title names anime notes and the anime table. English and Japanese fall back to the romaji title when there’s none. After changing it, regenerate the library note to update the table; existing note names don’t change.',
				control: { type: 'dropdown', key: 'animeTitle', options: ANIME_TITLES },
			},
			{
				name: 'Check sources',
				desc: 'Makes one small request to each service, to check that it can be reached.',
				render: (setting) => {
					for (const id of freeSources) {
						const source = getSource(id);
						if (source) setting.addButton((button) => button.setButtonText(source.name).onClick(() => void this.checkSource(id)));
					}
				},
			},
		];
	}

	private tmdbItems(): SettingGroupItem<SettingKey>[] {
		return [
			this.keyItem(
				'tmdbKeySecret',
				'Read Access Token or API key',
				createFragment((frag) => {
					frag.appendText('Optional; movies need TMDB or OMDb. TMDB is free for non-commercial use: create an account at ');
					frag.createEl('a', { text: 'themoviedb.org', href: 'https://www.themoviedb.org/signup' });
					frag.appendText(', then under ');
					frag.createEl('a', { text: 'Settings → API', href: 'https://www.themoviedb.org/settings/api' });
					frag.appendText(
						' request a developer key and copy the "API Read Access Token" (it’s sent in a header, never in a web address). The key is kept in Obsidian’s keychain, not in this plugin’s settings file. Searches send what you type, and your key, to TMDB.',
					);
				}),
			),
			{
				name: 'Check TMDB key',
				desc: 'Makes one small request to TMDB with your key.',
				visible: () => this.plugin.getSecret(this.plugin.settings.tmdbKeySecret) !== '',
				action: () => void this.checkSource('tmdb'),
			},
			{
				name: `Refresh ${tmdb.name} notes`,
				desc: refreshStatus(this.plugin),
				action: () =>
					void this.run(async () => {
						await refreshTmdbNotes(this.plugin);
						this.update();
					}),
			},
			{
				name: 'Preferred language',
				desc: 'Two-letter code, such as en or es, for TMDB’s titles and descriptions. The other sources are in English. Leave empty for TMDB’s default.',
				control: {
					type: 'text',
					key: 'language',
					placeholder: 'en',
					validate: (value) =>
						!value.trim() || LANGUAGE_CODE.test(value.trim()) ? undefined : 'Use a two-letter lowercase code, such as en.',
				},
			},
		];
	}

	private omdbItems(): SettingGroupItem<SettingKey>[] {
		return [
			this.keyItem(
				'omdbKeySecret',
				'API key',
				createFragment((frag) => {
					frag.appendText('Optional; a backup for movies and TV shows. Request a free key (1,000 requests a day) at ');
					frag.createEl('a', { text: 'omdbapi.com', href: 'https://www.omdbapi.com/apikey.aspx' });
					frag.appendText(
						'; it arrives by email. The key is kept in Obsidian’s keychain. OMDb only accepts it in the web address of each request, so it’s sent to OMDb with what you type.',
					);
				}),
			),
			{
				name: 'Check OMDb key',
				desc: 'Makes one small request to OMDb with your key.',
				visible: () => this.plugin.getSecret(this.plugin.settings.omdbKeySecret) !== '',
				action: () => void this.checkSource('omdb'),
			},
		];
	}

	/** A key kept in Obsidian's keychain; the settings store only the secret's name. */
	private keyItem(key: 'tmdbKeySecret' | 'omdbKeySecret', name: string, desc: DocumentFragment): SettingGroupItem<SettingKey> {
		return {
			name,
			desc,
			render: (setting) => {
				setting.addComponent((el) =>
					new SecretComponent(this.app, el).setValue(this.plugin.settings[key]).onChange(async (value) => {
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
						// The source lists (dropdowns, search window) depend on which keys are set.
						this.update();
					}),
				);
			},
		};
	}

	private creditItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'TMDB',
				desc: createFragment((frag) => {
					frag.appendText(`${TMDB_NOTICE} Movie, TV, and anime information and posters from `);
					frag.createEl('a', { text: tmdb.name, href: 'https://www.themoviedb.org' });
					frag.appendText(' when you use your TMDB key.');
				}),
				render: (setting) => {
					// TMDB's approved logo, unchanged and bundled with the plugin; smaller than the plugin's own name.
					const link = setting.controlEl.createEl('a', { href: 'https://www.themoviedb.org', attr: { 'aria-label': 'TMDB' } });
					link.createEl('img', { cls: 'watchlist-notes-tmdb-logo', attr: { src: tmdbLogo, alt: 'TMDB' } });
				},
			},
			{
				name: 'TVmaze',
				desc: createFragment((frag) => {
					frag.appendText('TV show information and posters from ');
					frag.createEl('a', { text: tvmaze.name, href: 'https://www.tvmaze.com' });
					frag.appendText(', licensed CC BY-SA. Each note links to the show’s page on TVmaze.');
				}),
			},
			{
				name: 'MyAnimeList',
				desc: createFragment((frag) => {
					frag.appendText('Anime information and posters from ');
					frag.createEl('a', { text: MYANIMELIST, href: 'https://myanimelist.net' });
					frag.appendText(', through the unofficial ');
					frag.createEl('a', { text: tenrai.name, href: 'https://tenrai.org' });
					frag.appendText(' and ');
					frag.createEl('a', { text: jikan.name, href: 'https://jikan.moe' });
					frag.appendText(' services. Not affiliated with MyAnimeList. Each note links to the anime’s MyAnimeList page.');
				}),
			},
			{
				name: 'OMDb',
				desc: createFragment((frag) => {
					frag.appendText('Movie and TV information from ');
					frag.createEl('a', { text: omdb.name, href: 'https://www.omdbapi.com' });
					frag.appendText(' when you use your OMDb key, licensed CC BY-NC 4.0.');
				}),
			},
		];
	}

	private async checkSource(id: SourceId): Promise<void> {
		const source = getSource(id);
		if (!source) return;
		try {
			new Notice(await source.check(this.plugin));
		} catch (err) {
			new Notice(`${source.name} check failed: ${toMediaError(err).message}`, 10_000);
		}
	}

	private async run(task: () => Promise<void>): Promise<void> {
		try {
			await task();
		} catch (err) {
			new Notice(toMediaError(err).message, 10_000);
		}
	}
}
