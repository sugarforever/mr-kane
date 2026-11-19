import type { SpeechLanguage } from '$lib/speech';
type Input = {
	text: string;
	language: SpeechLanguage;
	rate: number;
	provider: string;
	model: string;
	voice: string;
	minimaxRegion?: string;
};
const pending = new Map<string, Promise<Blob>>();
const memory = new Map<string, Blob>();
export async function speechAudio(input: Input): Promise<Blob> {
	const identity = JSON.stringify([
		1,
		input.text,
		input.language,
		input.rate,
		input.provider,
		input.model,
		input.voice,
		input.provider === 'minimax'
			? (input.minimaxRegion ?? 'international')
			: undefined,
	]);
	const saved = memory.get(identity);
	if (saved) return saved;
	const existing = pending.get(identity);
	if (existing) return existing;
	const job = (async () => {
		let cache: Cache | undefined;
		let key: string | undefined;
		try {
			if (typeof caches !== 'undefined' && globalThis.crypto?.subtle) {
				const digest = await crypto.subtle.digest(
					'SHA-256',
					new TextEncoder().encode(identity),
				);
				key = `${location.origin}/api/speech/cached/${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
				cache = await caches.open('mr-kane-speech-v1');
				const response = await cache.match(key);
				if (response) return await response.blob();
			}
		} catch {
			/* Private browsing/storage failures fall back to server caching. */
		}
		const response = await fetch('/api/speech/synthesize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: input.text,
				language: input.language,
				rate: input.rate,
				expectedVoice: {
					provider: input.provider,
					model: input.model,
					voice: input.voice,
					...(input.provider === 'minimax'
						? { minimaxRegion: input.minimaxRegion ?? 'international' }
						: {}),
				},
			}),
		});
		if (!response.ok) {
			const value = await response.json();
			throw new Error(value.message || 'Speech generation failed.');
		}
		const blob = await response.blob();
		if (!blob.size) throw new Error('Speech generation returned empty audio.');
		if (cache && key) {
			try {
				await cache.put(key, new Response(blob));
				// Bound downloaded audio storage; server copies remain reusable after eviction.
				const keys = await cache.keys();
				await Promise.all(
					keys
						.slice(0, Math.max(0, keys.length - 200))
						.map((entry) => cache!.delete(entry)),
				);
			} catch {
				/* Keep playing if browser storage is full. */
			}
		}
		return blob;
	})();
	pending.set(identity, job);
	try {
		const blob = await job;
		memory.set(identity, blob);
		if (memory.size > 32) memory.delete(memory.keys().next().value!);
		return blob;
	} finally {
		pending.delete(identity);
	}
}
