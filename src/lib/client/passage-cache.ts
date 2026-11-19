import { languageSchema, type Language } from '$lib/languages';
import { parsePassageTranslation } from '$lib/reading';
// Version the cache when translation instructions change so old wording is regenerated.
const key = 'mr-kane-passage-translations-v2';
type Entry = { text: string; language: Language; paragraphs: string[] };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
function entries(store: Store): Entry[] {
	const raw = store.getItem(key);
	if (!raw) return [];
	const value: unknown = JSON.parse(raw);
	if (!Array.isArray(value)) throw new Error('Invalid translation cache.');
	return value.filter(
		(e): e is Entry =>
			!!e &&
			typeof e.text === 'string' &&
			languageSchema.safeParse(e.language).success &&
			Array.isArray(e.paragraphs),
	);
}
export function cachedPassage(store: Store, text: string, language: Language) {
	const entry = entries(store).find(
		(e) => e.text === text && e.language === language,
	);
	return entry ? parsePassageTranslation(entry, text) : undefined;
}
export function cachePassage(
	store: Store,
	text: string,
	language: Language,
	paragraphs: string[],
) {
	const validated = parsePassageTranslation({ paragraphs }, text);
	const next = entries(store).filter(
		(e) => e.text !== text || e.language !== language,
	);
	// Bound the cache; losing a cached translation never deletes practice records.
	store.setItem(
		key,
		JSON.stringify(
			[{ text, language, paragraphs: validated }, ...next].slice(0, 20),
		),
	);
}
