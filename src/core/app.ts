import type { App } from 'obsidian';

// Obsidian has no public API to open a plugin's settings tab. The app's own
// code uses `app.setting.open()` and `openTabById(id)`; if they ever change,
// canOpenSettings() is false and the plugin says where to go instead.
interface SettingWindow {
	open(): void;
	openTabById(id: string): unknown;
}

function settingWindow(app: App): SettingWindow | null {
	const setting = (app as unknown as { setting?: Partial<SettingWindow> }).setting;
	return typeof setting?.open === 'function' && typeof setting.openTabById === 'function'
		? (setting as SettingWindow)
		: null;
}

export function canOpenSettings(app: App): boolean {
	return settingWindow(app) !== null;
}

/** Open Settings at this plugin's tab. Returns false if that isn't possible. */
export function openPluginSettings(app: App, pluginId: string): boolean {
	const setting = settingWindow(app);
	if (!setting) return false;
	setting.open();
	setting.openTabById(pluginId);
	return true;
}
