import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createStudy } from '../src/lib/server/learning/study';
import {
	createMathSession,
	getMathSession,
} from '../src/lib/server/math/study';

let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
const makeStudy = () =>
	createStudy({
		namespace: 'history',
		title: 'New history conversation',
		operation: 'history-chat',
		agent: {
			id: 'history-v1',
			loadPrompt: async () => 'Teach history',
			createTools: () => [],
			execution: { maxTurns: 2, streamTimeoutMs: 55000, timeoutMs: 60000 },
		},
		emptyLearner: () => ({ era: '' }),
		answerSchema: z.object({
			reply: z.string().min(1).max(20000),
			learner: z.object({ era: z.string() }),
		}),
	});
it('reuses durable turns for another learner schema and isolates subjects while filtering progress', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-session-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	const history = makeStudy();
	const session = await history.createSession();
	const math = await createMathSession();
	const id = randomUUID();
	let context: unknown;
	await expect(
		history.runTurn(session.id, id, 'Roman history', async (_op, data) => {
			context = data;
			return JSON.stringify({
				reply: 'bad profile',
				learner: { background: 'math' },
			});
		}),
	).rejects.toThrow(/incomplete/);
	expect((await history.getSession(session.id)).messages).toEqual([]);
	expect((await history.getSession(session.id)).pending?.id).toBe(id);
	await expect(
		history.runTurn(session.id, randomUUID(), 'Next', async () => ''),
	).rejects.toThrow(/pending/);
	const progress: unknown[] = [];
	const saved = await history.runTurn(
		session.id,
		id,
		'Roman history',
		async (op, data, _schema, requestId, options) => {
			expect(op).toBe('history-chat');
			expect(requestId).toBe(`history-${id}`);
			expect(data).toEqual(context);
			expect(options.agent?.id).toBe('history-v1');
			options.onProgress?.({
				text: '{"learner":{"reply":"private"}',
				reading: true,
			});
			options.onProgress?.({ text: '{"reply":"Consider Rome', reading: false });
			return JSON.stringify({
				reply: 'Consider Rome.',
				learner: { era: 'Roman' },
			});
		},
		(event) => progress.push(event),
	);
	expect(progress).toEqual([
		{ type: 'progress', reply: '', status: 'reading' },
		{ type: 'progress', reply: 'Consider Rome', status: 'writing' },
		{ type: 'progress', reply: 'Consider Rome.', status: 'saving' },
	]);
	expect(saved.learner).toEqual({ era: 'Roman' });
	expect(saved.messages).toHaveLength(2);
	await history.runTurn(session.id, id, 'Roman history', async () => {
		throw new Error('must not regenerate');
	});
	expect(await makeStudy().getSession(session.id)).toEqual(saved);
	expect(await history.listSessions()).toHaveLength(1);
	expect((await getMathSession(math.id)).messages).toEqual([]);
	await expect(history.getSession(math.id)).rejects.toThrow(/not found/);
	const discarded = randomUUID();
	await expect(
		history.runTurn(session.id, discarded, 'Next', async () => {
			throw new Error('offline');
		}),
	).rejects.toThrow('offline');
	await history.discardTurn(session.id, discarded);
	await expect(
		history.runTurn(session.id, discarded, 'Next', async () => ''),
	).rejects.toThrow(/discarded/);
	expect((await history.getSession(session.id)).pending).toBeNull();
});
