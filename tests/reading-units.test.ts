import { expect, it } from 'vitest';
import {
	readingUnits,
	readingItems,
	validateReadingScript,
} from '../src/lib/reading-levels';
import { demoPractice } from '../src/lib/demo';
import {
	defaultProfile,
	requestSchema,
	practiceSchema,
	restoreNotebook,
} from '../src/lib/domain';
it('keeps training units optional for old requests and rejects unknown units', () => {
	const request = {
		profile: defaultProfile,
		mode: 'speaking',
		sourceType: 'daily',
		material: '',
	};
	expect(requestSchema.parse(request).readingUnit).toBeUndefined();
	expect(
		requestSchema.safeParse({ ...request, readingUnit: 'chapter' }).success,
	).toBe(false);
	for (const unit of readingUnits)
		expect(
			requestSchema.parse({ ...request, readingUnit: unit.value }).readingUnit,
		).toBe(unit.value);
});
it.each(['ga', 'es'] as const)(
	'provides all four correctly shaped %s demos and persists unit metadata',
	(language) => {
		for (const { value } of readingUnits) {
			const input = {
				profile: { ...defaultProfile, language },
				mode: 'speaking' as const,
				sourceType: 'daily' as const,
				material: '',
				readingUnit: value,
			};
			const content = demoPractice(input);
			expect(() => validateReadingScript(content.script, value)).not.toThrow();
			const practice = practiceSchema.parse({
				...content,
				profile: input.profile,
				mode: 'speaking',
				readingUnit: value,
				id: value,
				origin: 'demo',
				createdAt: '2026-11-17',
			});
			expect(
				restoreNotebook(
					JSON.stringify({
						version: 1,
						practices: [practice],
						attempts: [],
						reviews: {},
					}),
				).practices[0].readingUnit,
			).toBe(value);
		}
	},
);
it('preserves legacy records and writing demos', () => {
	const content = demoPractice({
		profile: defaultProfile,
		mode: 'writing',
		sourceType: 'daily',
		material: '',
	});
	const practice = practiceSchema.parse({
		...content,
		profile: defaultProfile,
		mode: 'speaking',
		id: 'legacy',
		origin: 'demo',
		createdAt: '2026-11-17',
	});
	expect(practice.readingUnit).toBeUndefined();
	expect(content.focus).toContain('A2');
});
it('rejects long output disguised as a smaller unit', () => {
	expect(() => validateReadingScript('word '.repeat(50), 'words')).toThrow();
	expect(() =>
		validateReadingScript(
			Array(6).fill('A sentence.').join('\n\n'),
			'sentences',
		),
	).toThrow();
	expect(() => validateReadingScript('One.\n\nTwo.', 'paragraph')).toThrow();
	expect(() =>
		validateReadingScript('Just one paragraph.', 'article'),
	).toThrow();
	expect(readingItems('hola\n\nadiós\ncasa')).toEqual([
		'hola',
		'adiós',
		'casa',
	]);
});

it('requires separate sentence items rather than one combined mini passage', () => {
	expect(() =>
		validateReadingScript('Hola. Vivo aquí. Me gusta el parque.', 'sentences'),
	).toThrow();
	expect(() =>
		validateReadingScript(
			'Hola. Vivo aquí.\n\nMe gusta el parque.',
			'sentences',
		),
	).toThrow();
	expect(() =>
		validateReadingScript('Vivo aquí.\n\nMe gusta el parque.', 'sentences'),
	).not.toThrow();
	expect(() => validateReadingScript('Una frase corta.', 'words')).toThrow();
	expect(() => validateReadingScript('hola', 'words', 1)).not.toThrow();
});
