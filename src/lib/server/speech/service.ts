import { join } from 'node:path';
import { dataDir } from '../providers-store';
import { cachedSpeech } from './cache';
import { readSpeechSettings, speechKey } from './settings';
import { sttProviders, ttsProviders } from './providers';
import { SpeechError } from './contracts';
import type { SpeechLanguage, SpeechSettings } from '$lib/speech';
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
	expectedVoice?: SpeechSettings['tts'],
) {
	const choice = readSpeechSettings().tts;
	if (
		expectedVoice &&
		(expectedVoice.provider !== choice.provider ||
			expectedVoice.model !== choice.model ||
			expectedVoice.voice !== choice.voice)
	)
		throw new SpeechError(
			400,
			'Speech settings changed. Please retry listening with the current voice.',
		);
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
	const provider = ttsProviders[choice.provider];
	signal?.throwIfAborted();
	return cachedSpeech(
		join(dataDir(), 'speech-cache'),
		{ text, language, rate, ...choice },
		() =>
			provider.synthesize({
				text,
				language,
				rate,
				model: choice.model,
				voice: choice.voice,
				key,
				// Generation survives a cancelled listener so subsequent clicks reuse it.
			}),
	);
}
