import { Notice, Plugin } from 'obsidian';
import { toMediaError } from './core/errors';
import { clearCache, setUserAgent } from './core/http';
import { regenerateLibraryNote } from './library/moc';
import { isWatchNote, toggleWatched } from './library/watched-status';
import { sanitizeSettings, WatchlistNotesSettings, WatchlistNotesSettingTab } from './settings';

export default class WatchlistNotesPlugin extends Plugin {
	settings!: WatchlistNotesSettings;

	async onload() {
		await this.loadSettings();
		// No contact email; the repo link identifies the plugin to each service.
		setUserAgent(`WatchlistNotes/${this.manifest.version} (+https://github.com/BurningBurrito/watchlist-notes)`);

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
			callback: () => this.run(() => regenerateLibraryNote(this)),
		});

		this.addSettingTab(new WatchlistNotesSettingTab(this.app, this));
	}

	onunload() {
		clearCache();
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

	private run(task: () => Promise<void>) {
		task().catch((err: unknown) => {
			new Notice(toMediaError(err).message, 10_000);
		});
	}
}
