import { defineDoc } from '@earendil-works/pi-durable';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openAgentHarness } from './agent';
import { dataDir, locked } from './providers-store';
import {
	pendingAISchema,
	emptyLearningRecords,
	learningRecordsSchema,
	learningCommandSchema,
	type LearningRecords,
} from '../learning-records';
const Records = defineDoc<{
	value: string;
	receipts: string[];
	results: string;
}>({
	kind: 'app.learning-records',
	version: 1,
	scope: 'session',
	initial: () => ({
		value: JSON.stringify(emptyLearningRecords()),
		receipts: [],
		results: '{}',
	}),
	checkpointWhen: () => true,
});
async function access<T>(
	work: (
		state: LearningRecords,
		receipts: string[],
		results: Record<string, { hash: string; response: string }>,
	) => T | Promise<T>,
	write: boolean,
): Promise<T> {
	const file = join(dataDir(), 'learning.sqlite');
	return locked(`learning:${file}`, async () => {
		const { harness } = await openAgentHarness(file);
		try {
			if (!write) {
				const doc = await harness.snapshot(Records, context);
				return await work(
					doc
						? learningRecordsSchema.parse(JSON.parse(doc.value))
						: emptyLearningRecords(),
					doc?.receipts ?? [],
					JSON.parse(doc?.results ?? '{}'),
				);
			}
			let result!: T;
			await harness.commit(async (tx) => {
				const doc = await tx.doc(Records);
				const state = learningRecordsSchema.parse(JSON.parse(doc.value));
				const results = JSON.parse(doc.results ?? '{}');
				result = await work(state, doc.receipts, results);
				doc.results = JSON.stringify(results);
				doc.value = JSON.stringify(learningRecordsSchema.parse(state));
			}, context);
			return result;
		} finally {
			await harness.close(context);
		}
	});
}
export function readLearning() {
	return access((state) => state, false);
}
const wordKey = (text: string, language: string) =>
	text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(language);
export async function learningCommand(input: unknown) {
	const command = learningCommandSchema.parse(input);
	return access((state, receipts) => {
		switch (command.type) {
			case 'profile.put':
				state.profiles[command.profile.language] = command.profile;
				break;
			case 'practice.put':
				state.notebook.practices = [
					command.practice,
					...state.notebook.practices.filter(
						(p) => p.id !== command.practice.id,
					),
				];
				break;
			case 'attempt.put':
				state.notebook.attempts = [
					command.attempt,
					...state.notebook.attempts.filter((a) => a.id !== command.attempt.id),
				];
				break;
			case 'draft.put':
				state.drafts[command.practiceId] = command.text;
				break;
			case 'review.put':
				state.notebook.reviews[command.key] = command.reviewed;
				break;
			case 'pending.put':
				if (state.pending && state.pending.id !== command.pending.id)
					throw new Error('Resume or dismiss the saved request first.');
				if (
					state.pending &&
					JSON.stringify(state.pending) !== JSON.stringify(command.pending)
				)
					throw new Error('This request ID belongs to different content.');
				state.pending = command.pending;
				break;
			case 'pending.clear':
				if (state.pending?.id === command.id) state.pending = null;
				break;
			case 'vocabulary.add': {
				const e = command.entry;
				const existing = state.vocabulary.find(
					(v) =>
						v.language === e.language &&
						wordKey(v.text, v.language) === wordKey(e.text, e.language),
				);
				if (existing) {
					if (!existing.english && e.english) existing.english = e.english;
				} else
					state.vocabulary.unshift({
						...e,
						id: randomUUID(),
						createdAt: new Date().toISOString(),
						reviewedAt: null,
					});
				break;
			}
			case 'vocabulary.patch': {
				const entry = state.vocabulary.find((v) => v.id === command.id);
				if (!entry) throw new Error('Vocabulary entry not found.');
				Object.assign(entry, command.patch);
				break;
			}
			case 'vocabulary.delete':
				state.vocabulary = state.vocabulary.filter((v) => v.id !== command.id);
				break;
			case 'legacy.import': {
				if (receipts.includes(command.receipt)) break;
				const old = command.data;
				for (const p of old.notebook.practices)
					if (!state.notebook.practices.some((v) => v.id === p.id))
						state.notebook.practices.push(p);
				for (const a of old.notebook.attempts)
					if (!state.notebook.attempts.some((v) => v.id === a.id))
						state.notebook.attempts.push(a);
				for (const [key, value] of Object.entries(old.notebook.reviews))
					if (!(key in state.notebook.reviews))
						state.notebook.reviews[key] = value;
				for (const [key, value] of Object.entries(old.drafts))
					if (!(key in state.drafts)) state.drafts[key] = value;
				for (const profile of Object.values(old.profiles))
					if (profile && !state.profiles[profile.language])
						state.profiles[profile.language] = profile;
				for (const v of old.vocabulary)
					if (
						!state.vocabulary.some(
							(e) =>
								e.id === v.id ||
								(e.language === v.language &&
									wordKey(e.text, e.language) === wordKey(v.text, v.language)),
						)
					)
						state.vocabulary.push(v);
				// Keep conflicting pending requests in the browser until explicitly resolved.
				if (old.pending && state.pending && state.pending.id !== old.pending.id)
					throw new Error(
						'Another saved request must be resolved before importing browser records.',
					);
				state.pending ??= old.pending;
				receipts.push(command.receipt);
				break;
			}
		}
		return state;
	}, true);
}
const requestHash = (path: string, input: unknown) =>
	createHash('sha256').update(JSON.stringify({ path, input })).digest('hex');
export class LearningRequestConflict extends Error {}
export function savedLearningResponse(
	id: string,
	path: string,
	input: unknown,
) {
	return access((_state, _receipts, results) => {
		const saved = results[id];
		if (!saved) return undefined;
		if (saved.hash !== requestHash(path, input))
			throw new LearningRequestConflict(
				'This request ID belongs to different content.',
			);
		return JSON.parse(saved.response);
	}, false);
}
export function saveLearningResponse(
	id: string,
	path: string,
	input: unknown,
	response: unknown,
	save: (state: LearningRecords) => void,
) {
	return access((state, _receipts, results) => {
		const hash = requestHash(path, input);
		if (results[id]) {
			if (results[id].hash !== hash)
				throw new LearningRequestConflict(
					'This request ID belongs to different content.',
				);
			return JSON.parse(results[id].response);
		}
		save(state);
		results[id] = { hash, response: JSON.stringify(response) };
		if (state.pending?.id === id) state.pending = null;
		return response;
	}, true);
}

export function beginLearningRequest(input: unknown) {
	const pending = pendingAISchema.parse(input);
	return access((state) => {
		if (state.pending && state.pending.id !== pending.id)
			throw new LearningRequestConflict(
				'Resume or dismiss the saved request first.',
			);
		if (
			state.pending &&
			requestHash(state.pending.path, state.pending.body) !==
				requestHash(pending.path, pending.body)
		)
			throw new LearningRequestConflict(
				'This request ID belongs to different content.',
			);
		state.pending ??= pending;
	}, true);
}
