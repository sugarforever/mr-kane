import { expect, it, vi } from 'vitest';
import { readStudyStream, type StudyProgress } from '../src/lib/study-stream';
import { studyResponse } from '../src/lib/server/learning/stream';

it('streams another subject incrementally and returns its typed completion', async () => {
	let release!: () => void;
	const gate = new Promise<void>((r) => {
		release = r;
	});
	let published!: () => void;
	const partial = new Promise<void>((r) => {
		published = r;
	});
	const result = { topic: 'Rome', notes: ['republic'] };
	const response = studyResponse(
		async (progress) => {
			progress({ type: 'progress', reply: 'Consider Rome', status: 'writing' });
			published();
			await gate;
			return result;
		},
		() => 'History unavailable',
	);
	const progress: StudyProgress[] = [];
	const reading = readStudyStream<typeof result>(response, (event) =>
		progress.push(event),
	);
	await partial;
	await vi.waitFor(() =>
		expect(progress.some((p) => p.reply === 'Consider Rome')).toBe(true),
	);
	release();
	expect(await reading).toEqual({ topic: 'Rome', notes: ['republic'] });
});
it('continues the operation after cancellation and stops heartbeat delivery', async () => {
	let release!: () => void;
	const gate = new Promise<void>((r) => {
		release = r;
	});
	let saved = false;
	vi.useFakeTimers();
	try {
		const response = studyResponse(
			async (progress) => {
				await gate;
				progress({ type: 'progress', reply: 'done', status: 'writing' });
				saved = true;
				return { saved };
			},
			() => 'failed',
		);
		const reader = response.body!.getReader();
		await reader.read();
		expect(vi.getTimerCount()).toBe(1);
		await reader.cancel();
		expect(vi.getTimerCount()).toBe(0);
		release();
		await gate;
		await Promise.resolve();
		expect(saved).toBe(true);
	} finally {
		release?.();
		vi.useRealTimers();
	}
});
it('converts operation failures into safe errors and clears its timer', async () => {
	vi.useFakeTimers();
	try {
		const response = studyResponse(
			async () => {
				throw new Error('private tool output');
			},
			() => 'Please retry history',
		);
		await expect(readStudyStream(response, () => {})).rejects.toThrow(
			'Please retry history',
		);
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});
