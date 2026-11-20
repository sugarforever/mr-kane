import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	learningCommand,
	readLearning,
} from '../src/lib/server/learning-store';
import { defaultProfile } from '../src/lib/domain';
import { demoPractice } from '../src/lib/demo';
const dirs: string[] = [];
function setup() {
	const d = mkdtempSync(join(tmpdir(), 'kane-learning-'));
	dirs.push(d);
	vi.stubEnv('MR_KANE_DATA_DIR', d);
}
afterEach(() => {
	vi.unstubAllEnvs();
	dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});
it('persists independent records across reopened harnesses without replacing unrelated data', async () => {
	setup();
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'writing',
			sourceType: 'daily',
			material: '',
			research: false,
		}),
		id: 'practice',
		profile: defaultProfile,
		mode: 'writing',
		origin: 'demo',
		createdAt: '2026-11-20',
	};
	await learningCommand({ type: 'practice.put', practice });
	await Promise.all([
		learningCommand({ type: 'profile.put', profile: defaultProfile }),
		learningCommand({
			type: 'draft.put',
			practiceId: 'practice',
			text: 'Hola',
		}),
	]);
	const state = await readLearning();
	expect(state.notebook.practices[0].id).toBe('practice');
	expect(state.drafts.practice).toBe('Hola');
	expect(state.profiles.es).toEqual(defaultProfile);
});
it('validates before mutation and imports each browser snapshot only once without overwriting server data', async () => {
	setup();
	await learningCommand({
		type: 'profile.put',
		profile: { ...defaultProfile, interests: 'Server preference' },
	});
	const payload = {
		profiles: { es: defaultProfile },
		drafts: { old: 'legacy' },
		notebook: { version: 1, practices: [], attempts: [], reviews: {} },
		vocabulary: [],
		pending: null,
	};
	await learningCommand({
		type: 'legacy.import',
		receipt: 'browser-snapshot',
		data: payload,
	});
	await learningCommand({ type: 'draft.put', practiceId: 'old', text: 'new' });
	await learningCommand({
		type: 'legacy.import',
		receipt: 'browser-snapshot',
		data: payload,
	});
	expect((await readLearning()).drafts.old).toBe('new');
	expect((await readLearning()).profiles.es?.interests).toBe(
		'Server preference',
	);
	await expect(
		learningCommand({ type: 'profile.put', profile: { language: 'invalid' } }),
	).rejects.toThrow();
	expect((await readLearning()).drafts.old).toBe('new');
});
it('deduplicates vocabulary, updates review state and deletes entries', async () => {
	setup();
	await learningCommand({
		type: 'vocabulary.add',
		entry: { language: 'es', text: ' Hola ', english: '' },
	});
	await learningCommand({
		type: 'vocabulary.add',
		entry: { language: 'es', text: 'hola', english: 'Hello' },
	});
	let entries = (await readLearning()).vocabulary;
	expect(entries).toHaveLength(1);
	expect(entries[0].english).toBe('Hello');
	await learningCommand({
		type: 'vocabulary.patch',
		id: entries[0].id,
		patch: { reviewedAt: '2026-11-20' },
	});
	expect((await readLearning()).vocabulary[0].reviewedAt).toBe('2026-11-20');
	await learningCommand({ type: 'vocabulary.delete', id: entries[0].id });
	expect((await readLearning()).vocabulary).toEqual([]);
});
it('commits a completed request with its business result and only clears its own pending record', async () => {
	setup();
	const id = '676a2e06-9411-4535-b899-ba5f51fb02d8';
	const pending = {
		id,
		path: '/api/practice',
		body: {
			profile: defaultProfile,
			mode: 'writing',
			sourceType: 'daily',
			material: '',
			research: false,
		},
	};
	await learningCommand({ type: 'pending.put', pending });
	const { saveLearningResponse } =
		await import('../src/lib/server/learning-store');
	await saveLearningResponse(
		id,
		'/api/practice',
		pending.body,
		{ id: 'result' },
		(state) => {
			state.drafts.result = 'saved';
		},
	);
	const state = await readLearning();
	expect(state.pending).toBeNull();
	expect(state.drafts.result).toBe('saved');
});
