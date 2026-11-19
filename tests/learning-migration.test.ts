import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { database } from '../src/lib/server/providers-store';
import {
	createMathSession,
	getMathSession,
	listMathSessions,
	runMathTurn,
	discardMathTurn,
} from '../src/lib/server/math/study';
import { emptyLearner, type MathSession } from '../src/lib/math';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('imports saved SQL conversations and pending context once, retaining request ownership and discard markers', async () => {
	dir = mkdtempSync(join(tmpdir(), 'study-migration-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	const pendingId = randomUUID(),
		completeId = randomUUID(),
		discardedId = randomUUID();
	const session: MathSession = {
		id: randomUUID(),
		title: 'Existing lesson',
		updatedAt: '2026-11-18T00:00:00.000Z',
		learner: { ...emptyLearner(), background: 'Grade 10' },
		messages: [
			{
				role: 'user',
				content: 'Earlier question',
				createdAt: '2026-11-18T00:00:00.000Z',
			},
			{
				role: 'assistant',
				content: 'Earlier reply',
				createdAt: '2026-11-18T00:00:00.000Z',
			},
		],
		pending: { id: pendingId, message: 'Frozen question' },
	};
	const frozen = {
		learner: session.learner,
		messages: [
			...session.messages,
			{ role: 'user', content: 'Frozen question' },
		],
		historyOmitted: false,
	};
	const db = database();
	try {
		db.exec(
			'CREATE TABLE math_sessions(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE math_turns(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,message TEXT NOT NULL,context TEXT NOT NULL,complete INTEGER NOT NULL DEFAULT 0)',
		);
		db.prepare('INSERT INTO math_sessions VALUES (?,?)').run(
			session.id,
			JSON.stringify(session),
		);
		const insert = db.prepare('INSERT INTO math_turns VALUES (?,?,?,?,?)');
		insert.run(
			pendingId,
			session.id,
			'Frozen question',
			JSON.stringify(frozen),
			0,
		);
		insert.run(completeId, session.id, 'Earlier question', '{}', 1);
		insert.run(discardedId, session.id, 'Discarded', '{}', -1);
	} finally {
		db.close();
	}
	expect(await getMathSession(session.id)).toEqual(session);
	expect(await listMathSessions()).toEqual([
		{
			id: session.id,
			title: 'Existing lesson',
			updatedAt: '2026-11-18T00:00:00.000Z',
		},
	]);
	const other = await createMathSession();
	await expect(
		runMathTurn(other.id, pendingId, 'Frozen question', async () => ''),
	).rejects.toThrow(/different/);
	await expect(
		runMathTurn(session.id, discardedId, 'Discarded', async () => ''),
	).rejects.toThrow(/discarded/);
	expect(
		await runMathTurn(session.id, completeId, 'Earlier question', async () => {
			throw new Error('must not regenerate');
		}),
	).toEqual(session);
	const saved = await runMathTurn(
		session.id,
		pendingId,
		'Frozen question',
		async (_op, data) => {
			expect(data).toEqual(frozen);
			return JSON.stringify({
				reply: 'Resumed reply',
				learner: { ...session.learner, goal: 'Algebra' },
			});
		},
	);
	expect(saved.messages).toHaveLength(4);
	expect(saved.learner.goal).toBe('Algebra');
	expect(saved.pending).toBeNull();
	// Reopening the native store must not re-import stale SQL state.
	expect(await getMathSession(session.id)).toEqual(saved);
	expect(await discardMathTurn(session.id, pendingId)).toEqual(saved);
});
