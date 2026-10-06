export type MediaErrorKind =
	| 'offline'
	| 'network'
	| 'timeout'
	| 'not-found'
	| 'rate-limited'
	| 'server'
	| 'bad-response'
	| 'config'
	| 'auth';

/**
 * A failed search or lookup. `message` is written for the user and is shown
 * as-is in the search window or a notice.
 */
export class MediaError extends Error {
	kind: MediaErrorKind;

	constructor(kind: MediaErrorKind, message: string) {
		super(message);
		this.name = 'MediaError';
		this.kind = kind;
	}
}

export function toMediaError(err: unknown): MediaError {
	if (err instanceof MediaError) return err;
	console.error('Watchlist Notes: unexpected error', err);
	return new MediaError('bad-response', 'Something went wrong. See the developer console for details.');
}
