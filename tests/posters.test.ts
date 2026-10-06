import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { App } from 'obsidian';
import { downloadPoster, imageExtension, savePoster } from '../src/core/posters';
import { fake, resetNetwork, setOnline } from './support/network';
import { makeApp } from './support/vault';

const bytes = (...start: number[]) => Uint8Array.from([...start, ...new Array<number>(2048).fill(7)]);
const base64 = (data: Uint8Array) => Buffer.from(data).toString('base64');
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
// A typical "no image" placeholder: a 43-byte 1×1 GIF.
const BLANK_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const URL = 'https://images.example/poster.jpg';

describe('posters', () => {
	beforeEach(resetNetwork);

	it('recognizes images by their bytes, not their name', () => {
		assert.equal(imageExtension(JPEG.buffer), 'jpg');
		assert.equal(imageExtension(bytes(0x89, 0x50, 0x4e, 0x47).buffer), 'png');
		assert.equal(imageExtension(bytes(0x47, 0x49, 0x46, 0x38).buffer), 'gif');
		assert.equal(imageExtension(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50).buffer), 'webp');
		assert.equal(imageExtension(new TextEncoder().encode('<html>not found</html>').buffer), null);
	});

	it('downloads a real poster', async () => {
		fake(URL, { status: 200, base64: base64(JPEG), headers: { 'content-type': 'image/jpeg' } });
		const image = await downloadPoster(URL, 'TVmaze');
		assert.equal(image?.extension, 'jpg');
		assert.equal(image?.data.byteLength, JPEG.length);
	});

	it('treats missing posters and placeholders as "no poster"', async () => {
		fake(URL, { status: 404, text: '' });
		assert.equal(await downloadPoster(URL, 'TVmaze'), null);
		fake(URL, { status: 200, base64: BLANK_GIF, headers: { 'content-type': 'image/gif' } });
		assert.equal(await downloadPoster(URL, 'TVmaze'), null, '1×1 placeholder GIF');
		fake(URL, { status: 200, text: '<html>not an image</html>' });
		assert.equal(await downloadPoster(URL, 'TVmaze'), null, 'HTML page');
		fake(URL, { status: 403, text: '' });
		assert.equal(await downloadPoster(URL, 'TVmaze'), null, 'forbidden');
	});

	it('reports a service that can’t be reached', async () => {
		fake(URL, { status: 503, text: '' });
		await assert.rejects(downloadPoster(URL, 'TVmaze'), /TVmaze is having problems \(error 503\)/);
		fake(URL, 'network-error');
		await assert.rejects(downloadPoster(URL, 'TVmaze'), /Could not reach TVmaze/);
		setOnline(false);
		await assert.rejects(downloadPoster(URL, 'TVmaze'), /You appear to be offline/);
	});

	it('saves the poster, creating the folder, and reuses an existing file instead of overwriting', async () => {
		const app = makeApp();
		const name = 'Severance (2022) - tvmaze-44933';
		const first = await savePoster(app as unknown as App, 'Synced Notes/Watch Library/Posters', name, { data: JPEG.buffer, extension: 'jpg' });
		assert.equal(first.path, `Synced Notes/Watch Library/Posters/${name}.jpg`);
		const other = new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer;
		const again = await savePoster(app as unknown as App, 'Synced Notes/Watch Library/Posters', name, { data: other, extension: 'jpg' });
		assert.equal(again, first);
		assert.equal((app.files.get(first.path) as ArrayBuffer).byteLength, JPEG.length, 'first image kept');
	});
});
