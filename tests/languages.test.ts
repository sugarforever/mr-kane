import { expect, it } from 'vitest';
import {
	defaultProfile,
	requestSchema,
	restoreNotebook,
} from '../src/lib/domain';
import { demoPractice } from '../src/lib/demo';
import {
	matchingVoice,
	passageInput,
	translationInput,
} from '../src/lib/reading';
import { synthesisInput, speechModel } from '../src/lib/speech';
import { cachePassage, cachedPassage } from '../src/lib/client/passage-cache';
import { addVocabulary, loadVocabulary } from '../src/lib/client/vocabulary';
import { researchQuery } from '../src/lib/server/research';
import { validateReadingScript } from '../src/lib/reading-levels';

it.each(['en', 'ja'] as const)(
	'supports %s practice, persistence, translation and speech',
	(language) => {
		const profile = { ...defaultProfile, language };
		const input = {
			profile,
			mode: 'speaking' as const,
			sourceType: 'exam' as const,
			material: '',
		};
		expect(requestSchema.safeParse(input).success).toBe(true);
		expect(researchQuery(input)).toContain(
			language === 'en' ? 'English' : 'Japanese',
		);
		const text = language === 'en' ? 'I walk in the park.' : '公園を歩きます。';
		expect(translationInput.safeParse({ language, text }).success).toBe(true);
		expect(passageInput.safeParse({ language, text }).success).toBe(true);
		expect(synthesisInput.safeParse({ language, text }).success).toBe(true);
		const voices = [
			{ lang: 'es-ES', localService: true },
			{ lang: `${language}-XX`, localService: true },
		];
		expect(matchingVoice(voices, language)).toBe(voices[1]);
		expect(speechModel('stt', 'openai', 'gpt-transcribe').languages).toContain(
			language,
		);
		expect(speechModel('tts', 'openai', 'gpt-4o-mini-tts').languages).toContain(
			language,
		);
		const values = new Map<string, string>();
		const store = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => {
				values.set(key, value);
			},
		};
		cachePassage(store, text, language, ['I walk in the park.']);
		expect(cachedPassage(store, text, language)).toEqual([
			'I walk in the park.',
		]);
		addVocabulary(store, { text, language, english: 'I walk in the park.' });
		expect(loadVocabulary(store)[0].language).toBe(language);
		for (const readingUnit of [
			'words',
			'sentences',
			'paragraph',
			'article',
		] as const) {
			const content = demoPractice({ ...input, readingUnit });
			expect(content.script).toMatch(
				language === 'ja' ? /[ぁ-んァ-ン]/ : /\bpark\b/,
			);
			expect(() =>
				validateReadingScript(content.script, readingUnit),
			).not.toThrow();
			const practice = {
				...content,
				profile,
				id: readingUnit,
				mode: 'speaking',
				origin: 'demo',
				createdAt: new Date().toISOString(),
			};
			expect(
				restoreNotebook(
					JSON.stringify({
						version: 1,
						practices: [practice],
						attempts: [],
						reviews: {},
					}),
				).practices[0].profile.language,
			).toBe(language);
		}
		for (const sourceType of ['daily', 'science'] as const) {
			expect(
				demoPractice({ ...input, sourceType, mode: 'writing' }).script,
			).toMatch(language === 'ja' ? /[ぁ-んァ-ン]/ : /\b(the|The)\b/);
		}
	},
);
