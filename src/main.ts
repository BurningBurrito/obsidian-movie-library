import { Menu, Notice, Plugin } from 'obsidian';
import { toMediaError } from './core/errors';
import { clearCache, setUserAgent } from './core/http';
import { regenerateLibraryNote } from './library/moc';
import { refreshTmdbNotes, remindIfDue } from './library/tmdb-refresh';
import { isWatchNote, toggleWatched } from './library/watched-status';
import { createTitleNote } from './media/create-note';
import type { MediaType } from './media/types';
import { sanitizeSettings, WatchlistNotesSettings, WatchlistNotesSettingTab } from './settings';
import { forgetFailures } from './sources';
import { tmdb } from './sources/tmdb';

// One command per type, so each can have its own hotkey; the ribbon icon offers the same as a menu.
const CREATE_COMMANDS: { type: MediaType; id: string; name: string; menu: string; icon: string }[] = [
	{ type: 'movie', id: 'create-movie-note', name: 'Create movie note', menu: 'Movie', icon: 'film' },
	{ type: 'tv', id: 'create-tv-show-note', name: 'Create TV show note', menu: 'TV show', icon: 'tv' },
	{ type: 'anime', id: 'create-anime-note', name: 'Create anime note', menu: 'Anime', icon: 'sparkles' },
];

export default class WatchlistNotesPlugin extends Plugin {
	settings!: WatchlistNotesSettings;

	async onload() {
		await this.loadSettings();
		// No contact email; the repo link identifies the plugin to each service.
		setUserAgent(`WatchlistNotes/${this.manifest.version} (+https://github.com/BurningBurrito/obsidian-movie-library)`);

		for (const command of CREATE_COMMANDS) {
			this.addCommand({
				id: command.id,
				name: command.name,
				callback: () => this.create(command.type),
			});
		}
		this.addCommand({
			id: 'toggle-watched-status',
			name: 'Toggle watched status',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!isWatchNote(file, this.settings)) return false;
				if (!checking) {
					this.run(async () => {
						const watched = await toggleWatched(this.app, file);
						new Notice(watched ? `Marked "${file.basename}" as watched.` : `Marked "${file.basename}" as unwatched.`);
					});
				}
				return true;
			},
		});
		this.addCommand({
			id: 'regenerate-watch-library',
			name: 'Regenerate library note',
			callback: () => {
				remindIfDue(this);
				this.run(() => regenerateLibraryNote(this));
			},
		});
		this.addCommand({
			id: 'refresh-tmdb-notes',
			name: `Refresh ${tmdb.name} notes`,
			callback: () => this.run(() => refreshTmdbNotes(this)),
		});

		this.addRibbonIcon('clapperboard', 'Create a watchlist note', (evt) => {
			const menu = new Menu();
			for (const command of CREATE_COMMANDS) {
				menu.addItem((item) =>
					item
						.setTitle(command.menu)
						.setIcon(command.icon)
						.onClick(() => this.create(command.type)),
				);
			}
			menu.showAtMouseEvent(evt);
		});

		this.addSettingTab(new WatchlistNotesSettingTab(this.app, this));
	}

	onunload() {
		clearCache();
		forgetFailures();
	}

	/** A secret from Obsidian's keychain (settings store only its name), or "" if not set. */
	getSecret(name: string): string {
		return name ? (this.app.secretStorage.getSecret(name) ?? '') : '';
	}

	async loadSettings() {
		this.settings = sanitizeSettings((await this.loadData()) as Partial<WatchlistNotesSettings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Create a note; first, once per session, mention notes from TMDB that are due for a refresh. */
	private create(type: MediaType) {
		remindIfDue(this);
		this.run(() => createTitleNote(this, type));
	}

	private run(task: () => Promise<void>) {
		task().catch((err: unknown) => {
			new Notice(toMediaError(err).message, 10_000);
		});
	}
}
