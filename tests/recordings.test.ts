import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
	saveRecording,
	patchRecording,
	listRecordings,
	deleteRecording,
} from '../src/lib/client/recordings';
import { demoPractice } from '../src/lib/demo';
import { defaultProfile } from '../src/lib/domain';
it('persists audio bytes, the original script and self-review notes across reads', async () => {
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'p',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-16',
	};
	const audio = {
		id: 'r',
		practice,
		blob: new Blob(['synthetic audio'], { type: 'audio/webm' }),
		duration: 3,
		createdAt: '2026-11-16',
		note: '',
	};
	await saveRecording(audio);
	practice.script = 'changed after recording';
	let saved = (await listRecordings())[0];
	expect(await saved.blob.text()).toBe('synthetic audio');
	expect(saved.practice.script).toContain('Después de las clases');
	await saveRecording({ ...saved, note: '再练第二句' });
	expect((await listRecordings())[0].note).toBe('再练第二句');
	await deleteRecording('r');
	expect(await listRecordings()).toEqual([]);
});

it('preserves transcripts and reading targets alongside legacy recording fields', async () => {
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'feedback-practice',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-17',
	};
	await saveRecording({
		id: 'feedback-audio',
		practice,
		blob: new Blob(['audio']),
		duration: 1,
		createdAt: '2026-11-17',
		note: 'Keep this note',
		targetText: 'Hola',
		speechCheck: { transcript: 'Hola', status: 'complete' },
	});
	const saved = (await listRecordings()).find(
		(r) => r.id === 'feedback-audio',
	)!;
	expect(saved.targetText).toBe('Hola');
	expect(saved.speechCheck?.transcript).toBe('Hola');
	expect(saved.note).toBe('Keep this note');
	await deleteRecording(saved.id);
});

it('atomically patches feedback and notes without losing fields or reviving deleted audio', async () => {
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'atomic',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-17',
	};
	await saveRecording({
		id: 'atomic',
		practice,
		blob: new Blob(['audio']),
		duration: 1,
		createdAt: '2026-11-17',
		note: '',
	});
	await Promise.all([
		patchRecording('atomic', { note: 'New note' }),
		patchRecording('atomic', {
			speechCheck: { transcript: 'Hola', status: 'complete' },
		}),
	]);
	const saved = (await listRecordings()).find((r) => r.id === 'atomic')!;
	expect(saved.note).toBe('New note');
	expect(saved.speechCheck?.transcript).toBe('Hola');
	await deleteRecording('atomic');
	expect(
		await patchRecording('atomic', { note: 'Late update' }),
	).toBeUndefined();
	expect((await listRecordings()).some((r) => r.id === 'atomic')).toBe(false);
});

it('saves Svelte reactive recording state before checking it, so another recording can start', async () => {
	// @ts-expect-error Svelte's internal runtime proxy has no public declaration; this test reproduces real reactive state.
	const { proxy } = await import('svelte/internal/client');
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'reactive',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-17',
	};
	const pending = proxy({
		id: 'reactive',
		practice,
		blob: new Blob(['recorded bytes'], { type: 'audio/webm' }),
		duration: 2,
		createdAt: '2026-11-17',
		note: '',
		targetText: 'Hola',
	});
	await expect(saveRecording(pending)).resolves.toBeUndefined();
	const saved = (await listRecordings()).find((r) => r.id === pending.id)!;
	expect(await saved.blob.text()).toBe('recorded bytes');
	expect(saved.targetText).toBe('Hola');
	const secondTake = proxy({ ...pending, id: 'reactive-second' });
	await expect(saveRecording(secondTake)).resolves.toBeUndefined();
	expect((await listRecordings()).some((r) => r.id === 'reactive-second')).toBe(
		true,
	);
	await deleteRecording('reactive-second');
	await deleteRecording(saved.id);
});
