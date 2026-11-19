import { languageSchema } from '$lib/languages';
import type { Language } from '$lib/languages';
import { z } from 'zod';
export const miniMaxRegionSchema = z.enum(['international', 'china']);
export type MiniMaxRegion = z.infer<typeof miniMaxRegionSchema>;
export function miniMaxBaseUrl(region: MiniMaxRegion = 'international') {
	return region === 'china'
		? 'https://api.minimaxi.com/v1'
		: 'https://api.minimax.io/v1';
}
export type SpeechLanguage = Language;
export type SpeechProviderId = 'openai' | 'minimax' | 'browser';
export type SpeechCapability = 'stt' | 'tts';
export type SpeechModel = {
	id: string;
	label: string;
	languages: SpeechLanguage[];
	inputFormat?: 'wav';
};
export type SpeechProviderInfo = {
	id: SpeechProviderId;
	label: string;
	stt: SpeechModel[];
	tts: SpeechModel[];
	voices: string[];
	voiceLabels?: Record<string, string>;
	note?: string;
};
export const speechCatalog: SpeechProviderInfo[] = [
	{
		id: 'browser',
		label: 'Local browser voice',
		stt: [],
		tts: [
			{
				id: 'local',
				label: 'Matching local device voice',
				languages: ['ga', 'es', 'en', 'ja'],
			},
		],
		voices: ['auto'],
		note: 'Requires a matching local language voice. No text is uploaded.',
	},
	{
		id: 'openai',
		label: 'OpenAI',
		stt: [
			{
				id: 'gpt-transcribe',
				label: 'GPT Transcribe',
				languages: ['ga', 'es', 'en', 'ja'],
			},
			{
				id: 'gpt-4o-mini-transcribe',
				label: 'GPT-4o mini Transcribe (until Feb 26, 2027)',
				languages: ['ga', 'es', 'en', 'ja'],
			},
		],
		tts: [
			{
				id: 'gpt-4o-mini-tts',
				label: 'GPT-4o mini TTS (until Jan 6, 2027)',
				languages: ['es', 'en', 'ja'],
			},
			{
				id: 'tts-1',
				label: 'TTS-1 (until Jan 6, 2027)',
				languages: ['es', 'en', 'ja'],
			},
		],
		voices: [
			'coral',
			'alloy',
			'ash',
			'echo',
			'fable',
			'nova',
			'onyx',
			'sage',
			'shimmer',
		],
		note: 'API key required; ChatGPT subscription OAuth does not grant audio API access. Remote TTS is enabled only for documented learning languages: Spanish, English and Japanese.',
	},
	{
		id: 'minimax',
		label: 'MiniMax',
		stt: [
			{
				id: 'asr-1.0',
				label: 'ASR 1.0',
				languages: ['es', 'en', 'ja'],
				inputFormat: 'wav',
			},
		],
		tts: [
			{
				id: 'speech-2.8-hd',
				label: 'Speech 2.8 HD',
				languages: ['es', 'en', 'ja'],
			},
			{
				id: 'speech-2.8-turbo',
				label: 'Speech 2.8 Turbo',
				languages: ['es', 'en', 'ja'],
			},
		],
		voices: [],
		note: 'Spanish, English and Japanese supported; Irish is not listed. Browser recordings are converted to WAV for recognition.',
	},
];
const choice = z
	.object({
		provider: z.enum(['openai', 'minimax', 'browser']),
		model: z.string().min(1).max(100),
	})
	.strict();
export const speechSettingsSchema = z
	.object({
		minimaxRegion: miniMaxRegionSchema.optional(),
		stt: choice,
		tts: choice.extend({ voice: z.string().min(1).max(100) }),
	})
	.strict()
	.superRefine((settings, ctx) => {
		for (const capability of ['stt', 'tts'] as const) {
			const selected = settings[capability];
			const provider = speechCatalog.find((p) => p.id === selected.provider);
			if (!provider?.[capability].some((m) => m.id === selected.model))
				ctx.addIssue({
					code: 'custom',
					path: [capability],
					message: `Choose a supported ${capability.toUpperCase()} provider and model.`,
				});
		}
		const tts = speechCatalog.find((p) => p.id === settings.tts.provider);
		if (tts?.id !== 'minimax' && !tts?.voices.includes(settings.tts.voice))
			ctx.addIssue({
				code: 'custom',
				path: ['tts', 'voice'],
				message: 'Choose a supported voice.',
			});
	});
export type SpeechSettings = z.infer<typeof speechSettingsSchema>;
export const defaultSpeechSettings: SpeechSettings = {
	stt: { provider: 'openai', model: 'gpt-transcribe' },
	tts: { provider: 'browser', model: 'local', voice: 'auto' },
};
export type PublicSpeechSettings = {
	settings: SpeechSettings;
	catalog: SpeechProviderInfo[];
	configured: Record<string, boolean>;
};
export const synthesisInput = z
	.object({
		text: z.string().trim().min(1).max(12000),
		language: languageSchema,
		rate: z.number().min(0.5).max(1.5).default(1),
		expectedVoice: choice
			.extend({
				voice: z.string().min(1).max(100),
				minimaxRegion: miniMaxRegionSchema.optional(),
			})
			.optional(),
	})
	.strict();
export function speechModel(
	capability: SpeechCapability,
	provider: SpeechProviderId,
	model: string,
) {
	const found = speechCatalog
		.find((p) => p.id === provider)
		?.[capability].find((m) => m.id === model);
	if (!found) throw new Error('Unsupported speech model.');
	return found;
}
