import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, locked, dataDir } from '../providers-store';
import { runCoach, type CoachOptions } from '../agent';
import { parseStreamingJson } from '@earendil-works/pi-ai';
import type { MathProgress } from '$lib/math-stream';
import {
	emptyLearner,
	mathAnswerSchema,
	mathTurnSchema,
	type MathSession,
	type MathSummary,
} from '$lib/math';
export class MathStudyError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}
function db() {
	const d = database();
	d.exec(
		`CREATE TABLE IF NOT EXISTS math_sessions(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS math_turns(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,message TEXT NOT NULL,context TEXT NOT NULL,complete INTEGER NOT NULL DEFAULT 0);`,
	);
	return d;
}
function validId(id: string) {
	if (!z.string().uuid().safeParse(id).success)
		throw new MathStudyError(400, 'Invalid conversation ID.');
}
export function createMathSession() {
	const s: MathSession = {
		id: randomUUID(),
		title: 'New math conversation',
		updatedAt: new Date().toISOString(),
		learner: emptyLearner(),
		messages: [],
		pending: null,
	};
	const d = db();
	try {
		d.prepare('INSERT INTO math_sessions VALUES (?,?)').run(
			s.id,
			JSON.stringify(s),
		);
	} finally {
		d.close();
	}
	return s;
}
export function listMathSessions(): MathSummary[] {
	const d = db();
	try {
		return (
			d.prepare('SELECT value FROM math_sessions').all() as { value: string }[]
		)
			.map((x) => JSON.parse(x.value) as MathSession)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
	} finally {
		d.close();
	}
}
export function getMathSession(id: string): MathSession {
	validId(id);
	const d = db();
	try {
		const x = d
			.prepare('SELECT value FROM math_sessions WHERE id=?')
			.get(id) as { value: string } | undefined;
		if (!x) throw new MathStudyError(404, 'Conversation not found.');
		return JSON.parse(x.value);
	} finally {
		d.close();
	}
}
function boundedMessages(messages: MathSession['messages']) {
	let budget = 24000;
	const out: MathSession['messages'] = [];
	for (const m of [...messages].reverse()) {
		if (out.length >= 16 || m.content.length > budget) break;
		budget -= m.content.length;
		out.unshift(m);
	}
	return out;
}
type Generate = (
	operation: string,
	data: unknown,
	schema: unknown,
	requestId: string,
	options: CoachOptions,
) => Promise<string>;
export async function runMathTurn(
	sessionId: string,
	requestId: string,
	message: string,
	generate: Generate = runCoach,
	onProgress?: (progress: MathProgress) => void,
) {
	validId(sessionId);
	const input = mathTurnSchema.parse({ requestId, message });
	return locked(`math-session:${dataDir()}:${sessionId}`, async () => {
		let session = getMathSession(sessionId);
		let turn:
			| {
					session_id: string;
					message: string;
					context: string;
					complete: number;
			  }
			| undefined;
		const d = db();
		try {
			turn = d
				.prepare(
					'SELECT session_id,message,context,complete FROM math_turns WHERE id=?',
				)
				.get(input.requestId) as typeof turn;
			if (
				turn &&
				(turn.session_id !== sessionId || turn.message !== input.message)
			)
				throw new MathStudyError(
					409,
					'This request belongs to different content.',
				);
			if (turn?.complete === -1)
				throw new MathStudyError(
					409,
					'This message was discarded. Send it as a new message.',
				);
			if (turn?.complete === 1) return session;
			if (session.pending && session.pending.id !== input.requestId)
				throw new MathStudyError(
					409,
					'Retry the pending message before sending another.',
				);
			if (!turn) {
				if (session.messages.length >= 400)
					throw new MathStudyError(
						409,
						'Start a new conversation to continue studying.',
					);
				const context = JSON.stringify({
					learner: session.learner,
					messages: [
						...boundedMessages(session.messages),
						{ role: 'user', content: input.message },
					],
					historyOmitted:
						boundedMessages(session.messages).length < session.messages.length,
				});
				turn = {
					session_id: sessionId,
					message: input.message,
					context,
					complete: 0,
				};
				session.pending = { id: input.requestId, message: input.message };
				d.exec('BEGIN IMMEDIATE');
				try {
					d.prepare('INSERT INTO math_turns VALUES (?,?,?,?,0)').run(
						input.requestId,
						sessionId,
						input.message,
						context,
					);
					d.prepare('UPDATE math_sessions SET value=? WHERE id=?').run(
						JSON.stringify(session),
						sessionId,
					);
					d.exec('COMMIT');
				} catch (e) {
					d.exec('ROLLBACK');
					throw e;
				}
			}
		} finally {
			d.close();
		}
		const raw = await generate(
			'math-chat',
			JSON.parse(turn!.context),
			z.toJSONSchema(mathAnswerSchema),
			`math-${input.requestId}`,
			{
				coach: 'math',
				onProgress: onProgress
					? ({ text, reading }) => {
							const partial = parseStreamingJson<{ reply?: unknown }>(
								text
									.replace(/^\s*```(?:json)?\s*/, '')
									.replace(/\s*```\s*$/, ''),
							);
							const reply =
								typeof partial?.reply === 'string'
									? partial.reply.slice(0, 20000)
									: '';
							onProgress({
								type: 'progress',
								reply,
								status: reading ? 'reading' : reply ? 'writing' : 'thinking',
							});
						}
					: undefined,
			},
		);
		let parsed: unknown;
		try {
			parsed = JSON.parse(
				raw.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''),
			);
		} catch {
			throw new MathStudyError(
				502,
				'The coach response could not be read. Retry this message.',
			);
		}
		const answer = mathAnswerSchema.safeParse(parsed);
		if (!answer.success)
			throw new MathStudyError(
				502,
				'The coach response was incomplete. Retry this message.',
			);
		const now = new Date().toISOString();
		session = {
			...session,
			title: session.messages.length
				? session.title
				: input.message.slice(0, 70),
			learner: answer.data.learner,
			messages: [
				...session.messages,
				{ role: 'user', content: input.message, createdAt: now },
				{ role: 'assistant', content: answer.data.reply, createdAt: now },
			],
			updatedAt: now,
			pending: null,
		};
		const save = db();
		try {
			save.exec('BEGIN IMMEDIATE');
			try {
				save
					.prepare('UPDATE math_sessions SET value=? WHERE id=?')
					.run(JSON.stringify(session), sessionId);
				save
					.prepare('UPDATE math_turns SET complete=1 WHERE id=?')
					.run(input.requestId);
				save.exec('COMMIT');
			} catch (e) {
				save.exec('ROLLBACK');
				throw e;
			}
		} finally {
			save.close();
		}
		return session;
	});
}

export async function discardMathTurn(sessionId: string, requestId: string) {
	validId(sessionId);
	validId(requestId);
	return locked(`math-session:${dataDir()}:${sessionId}`, async () => {
		const session = getMathSession(sessionId);
		if (session.pending?.id !== requestId) return session;
		session.pending = null;
		const d = db();
		try {
			d.exec('BEGIN IMMEDIATE');
			try {
				d.prepare(
					'UPDATE math_turns SET complete=-1 WHERE id=? AND session_id=?',
				).run(requestId, sessionId);
				d.prepare('UPDATE math_sessions SET value=? WHERE id=?').run(
					JSON.stringify(session),
					sessionId,
				);
				d.exec('COMMIT');
			} catch (e) {
				d.exec('ROLLBACK');
				throw e;
			}
		} finally {
			d.close();
		}
		return session;
	});
}
