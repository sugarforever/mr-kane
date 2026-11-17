import { readSpeechSettings, speechKey } from './settings';
import { sttProviders, ttsProviders } from './providers';
import { SpeechError } from './contracts';
import type { SpeechLanguage } from '$lib/speech';
export async function recognizeSpeech(
	audio: Blob,
	language: SpeechLanguage,
	signal?: AbortSignal,
) {
	const choice = readSpeechSettings().stt;
	if (choice.provider === 'browser')
		throw new SpeechError(
			400,
			'Choose a speech recognition provider in Speech settings.',
		);
	const key = speechKey(choice.provider);
	if (!key)
		throw new SpeechError(
			503,
			`Add a ${choice.provider} API key in Speech settings. Subscription OAuth cannot be used for audio.`,
		);
	return sttProviders[choice.provider].transcribe({
		audio,
		language,
		model: choice.model,
		key,
		signal,
	});
}
export async function generateSpeech(
	text: string,
	language: SpeechLanguage,
	rate: number,
	signal?: AbortSignal,
) {
	const choice = readSpeechSettings().tts;
	if (choice.provider === 'browser')
		throw new SpeechError(
			400,
			'The selected local voice must play in your browser.',
		);
	const key = speechKey(choice.provider);
	if (!key)
		throw new SpeechError(
			503,
			`Add a ${choice.provider} API key in Speech settings.`,
		);
	return ttsProviders[choice.provider].synthesize({
		text,
		language,
		rate,
		model: choice.model,
		voice: choice.voice,
		key,
		signal,
	});
}
