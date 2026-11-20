import {
	emptyLearningRecords,
	learningRecordsSchema,
} from '../learning-records';
import { restoreNotebook, profileSchema, legacyAgeGroup } from '../domain';
import { updateLearning, readLearningRecords } from './learning';
/** Compatibility only: new learning data is never written to browser storage. */
export async function importBrowserLearning(store?: Storage) {
	if (!store) {
		try {
			store = localStorage;
			Object.keys(store);
		} catch {
			return readLearningRecords();
		}
	}
	const keys = Object.keys(store).filter(
		(k) =>
			[
				'mr-kane-notebook',
				'mr-kane-profiles',
				'mr-kane-vocabulary',
				'mr-kane-pending-ai',
			].includes(k) || k.startsWith('mr-kane-draft:'),
	);
	if (!keys.length) return readLearningRecords();
	const originals = Object.fromEntries(
		keys.sort().map((k) => [k, store.getItem(k)]),
	);
	const data = emptyLearningRecords();
	data.notebook = restoreNotebook(originals['mr-kane-notebook'] ?? null);
	const rawProfiles = JSON.parse(originals['mr-kane-profiles'] || '{}');
	for (const value of Object.values(rawProfiles)) {
		const p = value as Record<string, unknown>;
		const profile = profileSchema.parse({
			...p,
			ageGroup: legacyAgeGroup(p.ageGroup as string),
		});
		data.profiles[profile.language] = profile;
	}
	data.vocabulary = JSON.parse(originals['mr-kane-vocabulary'] || '[]');
	data.pending = JSON.parse(originals['mr-kane-pending-ai'] || 'null');
	for (const [key, value] of Object.entries(originals))
		if (key.startsWith('mr-kane-draft:') && value !== null)
			data.drafts[key.slice('mr-kane-draft:'.length)] = value;
	// Validate all sources before importing any of them.
	const validated = learningRecordsSchema.parse(data);
	let saved = await readLearningRecords();
	for (const [key, value] of Object.entries(originals)) {
		const partial = emptyLearningRecords();
		if (key === 'mr-kane-notebook') partial.notebook = validated.notebook;
		else if (key === 'mr-kane-profiles') partial.profiles = validated.profiles;
		else if (key === 'mr-kane-vocabulary')
			partial.vocabulary = validated.vocabulary;
		else if (key === 'mr-kane-pending-ai') partial.pending = validated.pending;
		else partial.drafts[key.slice('mr-kane-draft:'.length)] = value ?? '';
		// Per-source receipts remain stable even if cleanup removes only some keys.
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(JSON.stringify([key, value])),
		);
		const receipt = Array.from(new Uint8Array(digest), (b) =>
			b.toString(16).padStart(2, '0'),
		).join('');
		saved = await updateLearning({
			type: 'legacy.import',
			receipt,
			data: partial,
		});
	}
	for (const [key, value] of Object.entries(originals)) {
		try {
			if (store.getItem(key) === value) store.removeItem(key);
		} catch {
			/* The server receipt prevents re-importing an old browser copy. */
		}
	}
	return saved;
}
