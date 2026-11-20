import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
vi.mock('../src/lib/server/language-agent', () => ({
	configured: () => true,
	hasCoachRequest: () => false,
	coachSources: () => ({ sources: [] }),
	runCoach: vi.fn(),
}));
import { runCoach } from '../src/lib/server/language-agent';
import { POST } from '../src/routes/api/practice/+server';
import { defaultProfile } from '../src/lib/domain';
import { readLearning } from '../src/lib/server/learning-store';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('saves generated practices before replying and replays the same saved record', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-api-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.mocked(runCoach).mockResolvedValue(
		JSON.stringify({
			title: 'A day',
			prompt: 'Read',
			script: 'Hola mundo.',
			vocabulary: ['Hola — Hello'],
			focus: 'Greeting',
			sourceNote: 'Example',
		}),
	);
	const id = randomUUID();
	const url = new URL('http://localhost/api/practice');
	const body = {
		profile: defaultProfile,
		mode: 'writing',
		sourceType: 'daily',
		material: '',
		research: false,
	};
	const req = (input = body) => ({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: {
				origin: url.origin,
				'content-type': 'application/json',
				'x-request-id': id,
			},
			body: JSON.stringify(input),
		}),
	});
	const first = await (await POST(req() as any)).json();
	expect((await readLearning()).notebook.practices).toEqual([first]);
	const again = await (await POST(req() as any)).json();
	expect(again).toEqual(first);
	expect(runCoach).toHaveBeenCalledTimes(1);
	await expect(
		POST(req({ ...body, material: 'changed' }) as any),
	).rejects.toMatchObject({ status: 409 });
});
it('retains a backend pending request when generation fails before the browser receives a result', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-api-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.mocked(runCoach).mockRejectedValue(new Error('offline'));
	const id = randomUUID();
	const url = new URL('http://localhost/api/practice');
	await expect(
		POST({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: {
					origin: url.origin,
					'content-type': 'application/json',
					'x-request-id': id,
				},
				body: JSON.stringify({
					profile: defaultProfile,
					mode: 'writing',
					sourceType: 'daily',
					material: '',
				}),
			}),
		} as any),
	).rejects.toMatchObject({ status: 502 });
	expect((await readLearning()).pending?.id).toBe(id);
});
it('loads feedback input from a saved attempt and persists feedback before returning', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-api-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	const { learningCommand } = await import('../src/lib/server/learning-store');
	const { POST: feedbackPOST } =
		await import('../src/routes/api/feedback/+server');
	const practice = {
		title: 'Example',
		prompt: 'Write',
		script: 'Hola',
		vocabulary: ['Hola — Hello'],
		focus: 'Greeting',
		sourceNote: 'Example',
		id: 'practice',
		profile: defaultProfile,
		mode: 'writing',
		origin: 'user',
		createdAt: '2026-11-20',
	};
	await learningCommand({
		type: 'attempt.put',
		attempt: {
			id: 'attempt',
			practice,
			text: 'Hola mundo',
			feedback: null,
			createdAt: '2026-11-20',
		},
	});
	const feedback = { encouragement: 'Good work', points: [] };
	vi.mocked(runCoach).mockResolvedValue(JSON.stringify(feedback));
	const url = new URL('http://localhost/api/feedback');
	const request = new Request(url, {
		method: 'POST',
		headers: {
			origin: url.origin,
			'content-type': 'application/json',
			'x-request-id': randomUUID(),
		},
		body: JSON.stringify({ attemptId: 'attempt' }),
	});
	expect(await (await feedbackPOST({ url, request } as any)).json()).toEqual(
		feedback,
	);
	expect((await readLearning()).notebook.attempts[0].feedback).toEqual(
		feedback,
	);
	expect((await readLearning()).pending).toBeNull();
	expect(vi.mocked(runCoach).mock.calls[0][1]).toMatchObject({
		text: 'Hola mundo',
		practice: { id: 'practice' },
	});
});
