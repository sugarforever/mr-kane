import { z } from 'zod';

export const languageSchema = z.enum(['ga', 'es', 'en', 'ja']);
export type Language = z.infer<typeof languageSchema>;
export const languageNames = {
	ga: 'Irish',
	es: 'Spanish',
	en: 'English',
	ja: 'Japanese',
} as const;
export const languages: {
	value: Language;
	label: string;
	placeholder: string;
}[] = [
	{ value: 'es', label: 'Spanish · Español', placeholder: 'Empieza aquí…' },
	{ value: 'ga', label: 'Irish · Gaeilge', placeholder: 'Tosaigh anseo…' },
	{ value: 'en', label: 'English', placeholder: 'Start here…' },
	{
		value: 'ja',
		label: 'Japanese · 日本語',
		placeholder: 'ここに書いてください…',
	},
];
