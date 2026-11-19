import type { Language } from '$lib/languages';
import {
	connections,
	defaultConnection,
	readCredential,
} from './providers-store';
export { SpeechError as TranscriptionError } from './speech/contracts';
import { sttProviders } from './speech/providers';
export function transcriptionKey(): string | undefined {
	const preferred = defaultConnection();
	const providers = connections();
	const ordered = preferred
		? [preferred, ...providers.filter((p) => p.id !== preferred.id)]
		: providers;
	for (const provider of ordered) {
		if (
			provider.service !== 'openai' ||
			provider.authMode !== 'api_key' ||
			provider.baseUrl.replace(/\/$/, '') !== 'https://api.openai.com/v1'
		)
			continue;
		const credential = readCredential(provider.credentialSlot);
		if (credential?.type === 'api_key' && credential.key) return credential.key;
	}
	// Settings must match the connection the user tested; environment is a fallback.
	return process.env.OPENAI_API_KEY?.trim() || undefined;
}
// Compatibility entry point for existing callers; new features use speech/service.
export async function transcribeAudio(
	audio: Blob,
	language: Language,
	key: string,
	signal?: AbortSignal,
) {
	return sttProviders.openai.transcribe({
		audio,
		language,
		key,
		signal,
		model: 'gpt-transcribe',
	});
}
