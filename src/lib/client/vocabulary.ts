import { languageSchema } from '$lib/languages';
import { z } from 'zod';
export const vocabularyKey = 'mr-kane-vocabulary';
import {
	vocabularyEntrySchema as entrySchema,
	type VocabularyEntry,
} from '../learning-records';
export type { VocabularyEntry };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export function loadVocabulary(store: Store): VocabularyEntry[] {
	const raw = store.getItem(vocabularyKey);
	if (!raw) return [];
	return z.array(entrySchema).parse(JSON.parse(raw));
}
export function writeVocabulary(store: Store, entries: VocabularyEntry[]) {
	store.setItem(
		vocabularyKey,
		JSON.stringify(z.array(entrySchema).parse(entries)),
	);
}
export function addVocabulary(
	store: Store,
	input: Pick<VocabularyEntry, 'text' | 'language' | 'english'>,
) {
	const parsed = entrySchema.parse({
		...input,
		text: input.text.trim(),
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		reviewedAt: null,
	});
	const entries = loadVocabulary(store);
	const key = (text: string) =>
		text
			.normalize('NFC')
			.replace(/\s+/g, ' ')
			.toLocaleLowerCase(input.language);
	const existing = entries.find(
		(e) => e.language === input.language && key(e.text) === key(parsed.text),
	);
	if (existing) {
		if (!existing.english && parsed.english) {
			existing.english = parsed.english;
			writeVocabulary(store, entries);
		}
		return false;
	}
	writeVocabulary(store, [parsed, ...entries]);
	return true;
}
