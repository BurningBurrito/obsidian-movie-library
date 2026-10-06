import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache, getJson, httpRequest } from '../src/core/http';
import { fake, json, requests, resetNetwork } from './support/network';

const URL = 'https://api.example/show';
const NAME = 'TVmaze';

/** Answer the same URL with each response in turn (the last one repeats). */
function answers(...list: Parameters<typeof json>[]) {
	let i = 0;
	fake(URL, () => json(...(list[Math.min(i++, list.length - 1)] as Parameters<typeof json>)));
}

describe('retries', () => {
	beforeEach(() => {
		resetNetwork();
		clearCache();
	});

	it('retries a rate limit after the wait the service asks for, and says so', async () => {
		const progress: string[] = [];
		answers([429, {}, { 'Retry-After': '1' }], [200, { ok: true }]);
		const response = await httpRequest(URL, { sourceName: NAME, onProgress: (m) => progress.push(m) });
		assert.equal(response.status, 200);
		assert.equal(requests.length, 2);
		assert.deepEqual(progress, ['TVmaze is busy; trying again…']);
	});

	it('gives up on a rate limit after two retries, or at once when the wait is long', async () => {
		answers([429, {}]);
		await assert.rejects(httpRequest(URL, { sourceName: NAME }), /TVmaze has received too many requests\. Try again in a few minutes\./);
		assert.equal(requests.length, 3, 'first try and two retries');

		resetNetwork();
		answers([429, {}, { 'retry-after': '120' }]);
		await assert.rejects(httpRequest(URL, { sourceName: NAME }), /Try again in 2 minutes\./);
		assert.equal(requests.length, 1, 'a 2-minute wait is not waited for');
	});

	it('retries server errors twice, then reports them', async () => {
		answers([503, {}], [504, {}], [200, { ok: true }]);
		assert.equal((await httpRequest(URL, { sourceName: NAME })).status, 200);
		assert.equal(requests.length, 3);

		resetNetwork();
		answers([502, {}]);
		await assert.rejects(httpRequest(URL, { sourceName: NAME }), /TVmaze is having problems \(error 502\)/);
		assert.equal(requests.length, 3);

		resetNetwork();
		answers([501, {}]);
		await assert.rejects(httpRequest(URL, { sourceName: NAME }), /error 501/);
		assert.equal(requests.length, 1, '501 (not implemented) is not retried');
	});

	it('can hand the final server error to the caller', async () => {
		answers([504, { message: 'Jikan failed to connect to MyAnimeList' }]);
		const response = await httpRequest(URL, { sourceName: 'Jikan', handleServerError: true });
		assert.equal(response.status, 504);
		assert.equal(requests.length, 3, 'still retried first');
	});

	it('does not retry timeouts or network failures', async () => {
		const progress: string[] = [];
		fake(URL, 'hang');
		await assert.rejects(httpRequest(URL, { sourceName: NAME, onProgress: (m) => progress.push(m) }), /TVmaze took too long to respond/);
		assert.equal(requests.length, 1);
		assert.deepEqual(progress, ['Still waiting for TVmaze…']);

		resetNetwork();
		fake(URL, 'network-error');
		await assert.rejects(httpRequest(URL, { sourceName: NAME }), /Could not reach TVmaze/);
		assert.equal(requests.length, 1);
	});

	it('remembers successful answers but not failures', async () => {
		answers([500, {}], [500, {}], [500, {}], [200, { n: 1 }]);
		await assert.rejects(getJson(URL, { sourceName: NAME, cache: true }));
		assert.deepEqual(await getJson(URL, { sourceName: NAME, cache: true }), { n: 1 });
		assert.deepEqual(await getJson(URL, { sourceName: NAME, cache: true }), { n: 1 });
		assert.equal(requests.length, 4, 'the cached answer needed no request');
	});
});
