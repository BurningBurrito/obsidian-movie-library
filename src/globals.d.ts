/** Set by esbuild: true in `npm run dev`, false in release builds (see esbuild.config.mjs). */
declare const DEV_BUILD: boolean;

/** SVG files are bundled as data URLs (see esbuild.config.mjs). */
declare module '*.svg' {
	const dataUrl: string;
	export default dataUrl;
}
