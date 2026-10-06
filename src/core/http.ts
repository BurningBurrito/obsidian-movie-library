import { requestUrl, RequestUrlResponse } from 'obsidian';
import { MediaError } from './errors';
import { delay, throttle, ThrottleRule } from './throttle';

const TIMEOUT_MS = 15_000;
/** How long before the search window says "Still waiting for …". */
const SLOW_MS = 5_000;
/** Waits before retrying a server error: 1 s, then 3 s. */
const SERVER_RETRY_DELAYS_MS = [1_000, 3_000];
const RETRYABLE_SERVER_ERRORS = new Set([500, 502, 503, 504]);
/** A 429 is retried at most twice, and only when the service asks for a short wait. */
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 2_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 50;

/** Identifies the plugin to every service it calls. Set once in onload. */
let userAgent = 'WatchlistNotes';

export function setUserAgent(value: string): void {
	userAgent = value;
}

/** Tells the user what's happening while they wait, e.g. in the search window. */
export type Progress = (message: string) => void;

export interface RequestOptions {
	/** Service name for error messages, e.g. "TVmaze". */
	sourceName: string;
	method?: 'GET' | 'POST';
	headers?: Record<string, string>;
	body?: string;
	contentType?: string;
	throttle?: ThrottleRule;
	/** Longer for services that are often slow. */
	timeoutMs?: number;
	/** "Still waiting for …" after a few seconds, "… is busy; trying again…" before a retry. */
	onProgress?: Progress;
	/** Return a 429 to the caller instead of retrying or the generic "too many requests" error. */
	handleRateLimit?: boolean;
	/** A clearer message for a server error that remains after the retries, e.g. "… can't reach MyAnimeList". */
	describeServerError?: (response: RequestUrlResponse) => string | undefined;
}

/**
 * Make a request with Obsidian's requestUrl (which, unlike fetch, isn't
 * blocked by CORS and works on mobile). Rate limits and server errors are
 * retried a couple of times, as the services ask; network trouble and
 * timeouts aren't, so an unreachable service hands over to the next source
 * quickly. Failures become MediaErrors; other statuses (including 4xx) are
 * returned for the caller to interpret.
 */
export async function httpRequest(url: string, options: RequestOptions): Promise<RequestUrlResponse> {
	const { sourceName } = options;
	let serverRetries = 0;
	let rateLimitRetries = 0;
	for (;;) {
		const response = await send(url, options);

		if (response.status === 429 && !options.handleRateLimit) {
			const waitMs = retryAfterMs(response);
			if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES && (waitMs ?? DEFAULT_RETRY_AFTER_MS) <= MAX_RETRY_AFTER_MS) {
				rateLimitRetries++;
				options.onProgress?.(`${sourceName} is busy; trying again…`);
				await delay(waitMs ?? DEFAULT_RETRY_AFTER_MS);
				continue;
			}
			throw rateLimited(sourceName, waitMs);
		}

		if (response.status >= 500) {
			const wait = SERVER_RETRY_DELAYS_MS[serverRetries];
			if (RETRYABLE_SERVER_ERRORS.has(response.status) && wait !== undefined) {
				serverRetries++;
				options.onProgress?.(`${sourceName} is busy; trying again…`);
				await delay(wait);
				continue;
			}
			throw new MediaError(
				'server',
				options.describeServerError?.(response) ?? `${sourceName} is having problems (error ${response.status}). Try again later.`,
			);
		}
		return response;
	}
}

/** One attempt: offline check, request spacing, timeout, and the "still waiting" message. */
async function send(url: string, options: RequestOptions): Promise<RequestUrlResponse> {
	const { sourceName, onProgress } = options;
	if (!navigator.onLine) {
		throw new MediaError('offline', 'You appear to be offline. Check your internet connection and try again.');
	}
	if (options.throttle) await throttle(options.throttle);

	const slow = onProgress ? window.setTimeout(() => onProgress(`Still waiting for ${sourceName}…`), SLOW_MS) : undefined;
	try {
		return await withTimeout(
			requestUrl({
				url,
				method: options.method ?? 'GET',
				headers: { 'User-Agent': userAgent, ...options.headers },
				body: options.body,
				contentType: options.contentType,
				throw: false,
			}),
			sourceName,
			options.timeoutMs ?? TIMEOUT_MS,
		);
	} catch (err) {
		if (err instanceof MediaError) throw err;
		// The URL isn't logged: for some services it contains the user's API key.
		console.error(`Watchlist Notes: request to ${sourceName} failed`, err);
		throw new MediaError('network', `Could not reach ${sourceName}. Check your internet connection and try again.`);
	} finally {
		if (slow !== undefined) window.clearTimeout(slow);
	}
}

/** Retry-After in milliseconds: seconds ("120") or a date. */
function retryAfterMs(response: RequestUrlResponse): number | undefined {
	const value = getHeader(response, 'retry-after')?.trim();
	if (!value) return undefined;
	if (/^\d+$/.test(value)) return Number(value) * 1000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function rateLimited(sourceName: string, waitMs: number | undefined): MediaError {
	const minutes = waitMs === undefined ? 0 : Math.ceil(waitMs / 60_000);
	const wait = minutes > 1 ? `in ${minutes} minutes` : minutes === 1 ? 'in a minute' : 'in a few minutes';
	return new MediaError('rate-limited', `${sourceName} has received too many requests. Try again ${wait}.`);
}

const cache = new Map<string, { at: number; value: unknown }>();

/** Forget remembered answers (when the plugin is turned off). */
export function clearCache(): void {
	cache.clear();
}

/**
 * GET a URL and parse its JSON. Successful answers are kept for 30 minutes,
 * so repeating a search doesn't ask the service again.
 */
export async function getJson(url: string, options: RequestOptions & { cache?: boolean }): Promise<unknown> {
	const cached = options.cache ? cache.get(url) : undefined;
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

	const response = await httpRequest(url, options);
	if (response.status === 404) throw new MediaError('not-found', `${options.sourceName} has no entry for this title.`);
	if (response.status !== 200) throw badResponse(options.sourceName);
	const value = parseJson(response, options.sourceName);
	if (options.cache) {
		cache.set(url, { at: Date.now(), value });
		if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value ?? '');
	}
	return value;
}

/** Parse a JSON body, turning invalid JSON into a MediaError. */
export function parseJson(response: RequestUrlResponse, sourceName: string): unknown {
	try {
		return JSON.parse(response.text) as unknown;
	} catch {
		throw badResponse(sourceName);
	}
}

export function badResponse(sourceName: string): MediaError {
	return new MediaError('bad-response', `${sourceName} sent a response Watchlist Notes couldn't read. Try again later.`);
}

export function getHeader(response: RequestUrlResponse, name: string): string | undefined {
	const key = Object.keys(response.headers).find((k) => k.toLowerCase() === name);
	return key === undefined ? undefined : response.headers[key];
}

function withTimeout<T>(promise: Promise<T>, sourceName: string, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new MediaError('timeout', `${sourceName} took too long to respond. Try again later.`));
		}, timeoutMs);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			},
		);
	});
}
