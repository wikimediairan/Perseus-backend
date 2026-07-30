/**
 * Installs linkedom's `DOMParser` as `globalThis.DOMParser` for the
 * duration of a parsing call. Workers have no native DOM, but the
 * parsing/extraction code below references the ambient global
 * `DOMParser` the way browser code does, so it needs to be installed
 * before that code runs.
 *
 * Reference-counted rather than a naive install/teardown pair: a Worker
 * isolate can interleave multiple concurrent requests' async code, so a
 * plain `install(); await ...; uninstall()` risks one request's teardown
 * clobbering the global out from under a different, concurrently
 * in-flight request in the same isolate. Counting concurrent holders and
 * only removing the global when the count returns to zero avoids that
 * race.
 */

import { DOMParser } from "linkedom";

let holders = 0;

export async function withDomEnvironment<T>(
	fn: () => Promise<T> | T,
): Promise<T> {
	if (holders === 0) {
		(globalThis as Record<string, unknown>).DOMParser = DOMParser;
	}
	holders++;

	try {
		return await fn();
	} finally {
		holders--;
		if (holders === 0) {
			delete (globalThis as Record<string, unknown>).DOMParser;
		}
	}
}
