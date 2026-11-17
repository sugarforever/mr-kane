import { expect, it } from 'vitest';
import {
	addVocabulary,
	loadVocabulary,
	writeVocabulary,
	vocabularyKey,
} from '../src/lib/client/vocabulary';
function storage() {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => {
			data.set(k, v);
		},
	};
}
it('persists selected text and optional meaning, separating languages and deduplicating normalized phrases', () => {
	const store = storage();
	expect(
		addVocabulary(store, {
			text: '  Buenos días ',
			language: 'es',
			english: '',
		}),
	).toBe(true);
	expect(
		addVocabulary(store, {
			text: 'buenos   días',
			language: 'es',
			english: 'Good morning',
		}),
	).toBe(false);
	expect(loadVocabulary(store)).toHaveLength(1);
	expect(loadVocabulary(store)[0]).toMatchObject({
		text: 'Buenos días',
		english: 'Good morning',
		reviewedAt: null,
	});
	expect(
		addVocabulary(store, { text: 'Buenos días', language: 'ga', english: '' }),
	).toBe(true);
	expect(loadVocabulary(store)).toHaveLength(2);
});
it('persists review status, meaning edits, and removal without changing other entries', () => {
	const store = storage();
	addVocabulary(store, { text: 'Dia duit', language: 'ga', english: 'Hello' });
	addVocabulary(store, { text: 'Hola', language: 'es', english: 'Hello' });
	const entries = loadVocabulary(store);
	writeVocabulary(
		store,
		entries.map((e) =>
			e.language === 'ga'
				? { ...e, reviewedAt: '2026-11-17', english: 'Hello / greeting' }
				: e,
		),
	);
	expect(loadVocabulary(store)[1].reviewedAt).toBe('2026-11-17');
	writeVocabulary(
		store,
		loadVocabulary(store).filter((e) => e.language !== 'es'),
	);
	expect(loadVocabulary(store)[0].english).toBe('Hello / greeting');
});
it('preserves damaged storage and reports write failures instead of claiming success', () => {
	const store = storage();
	store.setItem(vocabularyKey, 'broken');
	expect(() =>
		addVocabulary(store, { text: 'Hola', language: 'es', english: '' }),
	).toThrow();
	expect(store.getItem(vocabularyKey)).toBe('broken');
	expect(() =>
		addVocabulary(
			{
				getItem: () => null,
				setItem: () => {
					throw new Error('Quota');
				},
			},
			{ text: 'Hola', language: 'es', english: '' },
		),
	).toThrow('Quota');
});
it('rejects empty and excessive selections before saving', () => {
	const store = storage();
	for (const text of [' ', 'x'.repeat(4001)])
		expect(() =>
			addVocabulary(store, { text, language: 'ga', english: '' }),
		).toThrow();
	expect(loadVocabulary(store)).toEqual([]);
});
