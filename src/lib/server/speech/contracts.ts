import type { SpeechLanguage } from '$lib/speech';
import type { SpeechCheck } from '$lib/client/speech-recognition';
export type SpeechRequest = {
	model: string;
	key: string;
	language: SpeechLanguage;
	signal?: AbortSignal;
};
export interface SpeechToTextProvider {
	transcribe(input: SpeechRequest & { audio: Blob }): Promise<SpeechCheck>;
}
export interface TextToSpeechProvider {
	synthesize(
		input: SpeechRequest & { text: string; voice: string; rate: number },
	): Promise<{ audio: ArrayBuffer; mimeType: string }>;
}
export class SpeechError extends Error {
	constructor(
		public status: 400 | 415 | 429 | 502 | 503,
		message: string,
	) {
		super(message);
	}
}
export async function providerFetch(
	provider: string,
	url: string,
	key: string,
	init: RequestInit,
	signal?: AbortSignal,
) {
	const response = await fetch(url, {
		...init,
		redirect: 'error',
		headers: { ...init.headers, Authorization: `Bearer ${key}` },
		signal: signal
			? AbortSignal.any([signal, AbortSignal.timeout(90000)])
			: AbortSignal.timeout(90000),
	});
	if (!response.ok) {
		await response.body?.cancel();
		if (response.status === 401)
			throw new SpeechError(
				503,
				`${provider} rejected the configured API key. Update it in Speech settings, then retry. Your recording is kept.`,
			);
		if (response.status === 403)
			throw new SpeechError(
				503,
				`${provider} denied audio access. Check the API key permissions and project access.`,
			);
		if (response.status === 429 || response.status === 402)
			throw new SpeechError(
				429,
				`${provider} audio usage is limited or API credit is unavailable. Check billing and limits.`,
			);
		throw new SpeechError(
			502,
			`${provider} could not process this audio request. Check model access and retry.`,
		);
	}
	return response;
}
export async function boundedBytes(
	response: Response,
	limit = 20 * 1024 * 1024,
): Promise<ArrayBuffer> {
	const reader = response.body?.getReader();
	if (!reader)
		throw new SpeechError(502, 'The speech provider returned no content.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit) {
				await reader.cancel();
				throw new SpeechError(
					502,
					'The speech provider response was too large. Try shorter text.',
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const joined = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.length;
	}
	return joined.buffer;
}
export async function providerJSON(response: Response, limit = 100000) {
	return JSON.parse(
		new TextDecoder().decode(await boundedBytes(response, limit)),
	);
}
