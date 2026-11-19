import { languageNames } from '$lib/languages';
import { z } from 'zod';
import { miniMaxBaseUrl, speechModel } from '$lib/speech';
import {
	SpeechError,
	boundedBytes,
	providerFetch,
	providerJSON,
	type SpeechRequest,
	type SpeechToTextProvider,
	type TextToSpeechProvider,
} from './contracts';
function supported(
	capability: 'stt' | 'tts',
	provider: 'openai' | 'minimax',
	input: SpeechRequest,
) {
	if (
		!speechModel(capability, provider, input.model).languages.includes(
			input.language,
		)
	)
		throw new SpeechError(
			400,
			`${provider} ${capability.toUpperCase()} does not support ${languageNames[input.language]} in this app. Choose a compatible provider in Speech settings.`,
		);
}
function audioFile(audio: Blob) {
	const type = audio.type.split(';')[0].trim();
	return type === 'audio/mp4'
		? 'recording.mp4'
		: type.includes('wav')
			? 'recording.wav'
			: 'recording.webm';
}
// Keep provider details out of errors: they may contain request text or credentials.
function miniMaxError(code: number) {
	if ([1004, 2049].includes(code))
		return new SpeechError(
			503,
			'MiniMax rejected the configured API key. Update it in Speech settings.',
		);
	if ([1008, 2053].includes(code))
		return new SpeechError(
			429,
			'MiniMax API credit is unavailable. Check billing.',
		);
	if ([1002, 1039, 1045, 2056, 2062].includes(code))
		return new SpeechError(
			429,
			'MiniMax audio usage is limited. Wait before retrying.',
		);
	if ([20132, 2042, 2043, 2054].includes(code))
		return new SpeechError(
			503,
			'MiniMax cannot use this voice. Choose another voice in Speech settings.',
		);
	if ([2022, 2061, 2068, 2069].includes(code))
		return new SpeechError(
			503,
			'MiniMax cannot use this model. Choose another model in Speech settings.',
		);
	return new SpeechError(
		502,
		'MiniMax speech generation failed. Check audio access and retry.',
	);
}
const miniMaxAudioFormats: Record<string, string> = {
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/aiff': 'aiff',
	'audio/x-aiff': 'aiff',
	'audio/flac': 'flac',
	'audio/x-flac': 'flac',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/aac': 'aac',
	'audio/opus': 'opus',
	'audio/ogg': 'ogg',
};
function transcript(value: unknown) {
	const { text } = z.object({ text: z.string().max(12000) }).parse(value);
	return {
		transcript: text.trim(),
		status: text.trim() ? ('complete' as const) : ('unavailable' as const),
		...(!text.trim()
			? {
					message:
						'No speech was recognised. Try a short word or sentence in a quiet place.',
				}
			: {}),
	};
}
export const sttProviders: Record<'openai' | 'minimax', SpeechToTextProvider> =
	{
		openai: {
			async transcribe(input) {
				supported('stt', 'openai', input);
				const body = new FormData();
				body.append('file', input.audio, audioFile(input.audio));
				body.append('model', input.model);
				body.append(
					input.model === 'gpt-transcribe' ? 'languages[]' : 'language',
					input.language,
				);
				return transcript(
					await providerJSON(
						await providerFetch(
							'OpenAI',
							'https://api.openai.com/v1/audio/transcriptions',
							input.key,
							{ method: 'POST', body },
							input.signal,
						),
					),
				);
			},
		},
		minimax: {
			async transcribe(input) {
				supported('stt', 'minimax', input);
				const format =
					miniMaxAudioFormats[
						input.audio.type.split(';')[0].trim().toLowerCase()
					];
				if (!format)
					throw new SpeechError(
						415,
						'MiniMax recognition requires WAV or a supported compressed audio format. Convert browser WebM recordings to WAV before upload.',
					);
				const body = new FormData();
				body.append('file', input.audio, `recording.${format}`);
				body.append('model', input.model);
				body.append('response_format', 'json');
				body.append('stream', 'false');
				return transcript(
					await providerJSON(
						await providerFetch(
							'MiniMax',
							miniMaxBaseUrl(input.minimaxRegion) + '/speech_to_text',
							input.key,
							{ method: 'POST', headers: { language: input.language }, body },
							input.signal,
						),
					),
				);
			},
		},
	};
export const ttsProviders: Record<'openai' | 'minimax', TextToSpeechProvider> =
	{
		openai: {
			async synthesize(input) {
				supported('tts', 'openai', input);
				if (input.text.length > 4000)
					throw new SpeechError(
						400,
						'Use up to 4,000 characters per generated speech segment.',
					);
				const response = await providerFetch(
					'OpenAI',
					'https://api.openai.com/v1/audio/speech',
					input.key,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model: input.model,
							input: input.text,
							voice: input.voice,
							speed: input.rate,
							response_format: 'mp3',
						}),
					},
					input.signal,
				);
				const audio = await boundedBytes(response);
				if (!audio.byteLength)
					throw new SpeechError(502, 'OpenAI returned empty audio.');
				return { audio, mimeType: 'audio/mpeg' };
			},
		},
		minimax: {
			async synthesize(input) {
				supported('tts', 'minimax', input);
				if (input.text.length > 4000)
					throw new SpeechError(
						400,
						'Use up to 4,000 characters per generated speech segment.',
					);
				const response = await providerFetch(
					'MiniMax',
					miniMaxBaseUrl(input.minimaxRegion) + '/t2a_v2',
					input.key,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model: input.model,
							text: input.text,
							stream: false,
							output_format: 'hex',
							language_boost: languageNames[input.language],
							voice_setting: { voice_id: input.voice, speed: input.rate },
							audio_setting: {
								format: 'mp3',
								sample_rate: 32000,
								bitrate: 128000,
								channel: 1,
							},
						}),
					},
					input.signal,
				);
				const payload: unknown = await providerJSON(response, 42 * 1024 * 1024);
				const envelope = z
					.object({ base_resp: z.object({ status_code: z.number() }) })
					.safeParse(payload);
				if (!envelope.success)
					throw new SpeechError(
						502,
						'MiniMax returned an invalid speech response.',
					);
				if (envelope.data.base_resp.status_code !== 0)
					throw miniMaxError(envelope.data.base_resp.status_code);
				const parsed = z
					.object({
						data: z.object({
							audio: z
								.string()
								.min(2)
								.max(40 * 1024 * 1024)
								.regex(/^(?:[a-fA-F0-9]{2})+$/),
						}),
					})
					.safeParse(payload);
				if (!parsed.success)
					throw new SpeechError(
						502,
						'MiniMax returned empty or invalid audio.',
					);
				const data = parsed.data;
				return {
					audio: new Uint8Array(Buffer.from(data.data.audio, 'hex')).buffer,
					mimeType: 'audio/mpeg',
				};
			},
		},
	};
