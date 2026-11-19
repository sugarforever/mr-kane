import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, locked, dataDir } from '../providers-store';
import { runAgent, type AgentOptions } from '../agent-runtime';
import { parseStreamingJson } from '@earendil-works/pi-ai';
import type { StudyProgress } from '$lib/study-stream';
import {
	studyTurnSchema,
	type StudySession,
	type StudySummary,
} from '$lib/learning';
import type { AgentDefinition } from '../agent-runtime';
export class StudyError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}
export type StudyConfig<Learner> = {
	namespace: string;
	title: string;
	operation: string;
	agent: AgentDefinition;
	emptyLearner: () => Learner;
	answerSchema: z.ZodType<{ reply: string; learner: Learner }>;
};
export function createStudy<Learner>(config: StudyConfig<Learner>) {
	// Identifiers are interpolated into SQL, so only trusted identifier characters are allowed.
	if (!/^[a-z][a-z0-9]{0,39}$/.test(config.namespace))
		throw new Error('Invalid study namespace.');
	type Session = StudySession<Learner>;
	function db() {
		const d = database();
		d.exec(
			`CREATE TABLE IF NOT EXISTS ${config.namespace}_sessions(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS ${config.namespace}_turns(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,message TEXT NOT NULL,context TEXT NOT NULL,complete INTEGER NOT NULL DEFAULT 0);`,
		);
		return d;
	}
	function validId(id: string) {
		if (!z.string().uuid().safeParse(id).success)
			throw new StudyError(400, 'Invalid conversation ID.');
	}
	function createSession() {
		const s: Session = {
			id: randomUUID(),
			title: config.title,
			updatedAt: new Date().toISOString(),
			learner: config.emptyLearner(),
			messages: [],
			pending: null,
		};
		const d = db();
		try {
			d.prepare(`INSERT INTO ${config.namespace}_sessions VALUES (?,?)`).run(
				s.id,
				JSON.stringify(s),
			);
		} finally {
			d.close();
		}
		return s;
	}
	function listSessions(): StudySummary[] {
		const d = db();
		try {
			return (
				d.prepare(`SELECT value FROM ${config.namespace}_sessions`).all() as {
					value: string;
				}[]
			)
				.map((x) => JSON.parse(x.value) as Session)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
		} finally {
			d.close();
		}
	}
	function getSession(id: string): Session {
		validId(id);
		const d = db();
		try {
			const x = d
				.prepare(`SELECT value FROM ${config.namespace}_sessions WHERE id=?`)
				.get(id) as { value: string } | undefined;
			if (!x) throw new StudyError(404, 'Conversation not found.');
			return JSON.parse(x.value);
		} finally {
			d.close();
		}
	}
	function boundedMessages(messages: Session['messages']) {
		let budget = 24000;
		const out: Session['messages'] = [];
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
		options: AgentOptions & { agent: AgentDefinition },
	) => Promise<string>;
	async function runTurn(
		sessionId: string,
		requestId: string,
		message: string,
		generate: Generate = (operation, data, schema, id, options) =>
			runAgent(operation, data, schema, id, options.agent, options),
		onProgress?: (progress: StudyProgress) => void,
	) {
		validId(sessionId);
		const input = studyTurnSchema.parse({ requestId, message });
		return locked(
			`${config.namespace}-session:${dataDir()}:${sessionId}`,
			async () => {
				let session = getSession(sessionId);
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
							`SELECT session_id,message,context,complete FROM ${config.namespace}_turns WHERE id=?`,
						)
						.get(input.requestId) as typeof turn;
					if (
						turn &&
						(turn.session_id !== sessionId || turn.message !== input.message)
					)
						throw new StudyError(
							409,
							'This request belongs to different content.',
						);
					if (turn?.complete === -1)
						throw new StudyError(
							409,
							'This message was discarded. Send it as a new message.',
						);
					if (turn?.complete === 1) return session;
					if (session.pending && session.pending.id !== input.requestId)
						throw new StudyError(
							409,
							'Retry the pending message before sending another.',
						);
					if (!turn) {
						if (session.messages.length >= 400)
							throw new StudyError(
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
								boundedMessages(session.messages).length <
								session.messages.length,
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
							d.prepare(
								`INSERT INTO ${config.namespace}_turns VALUES (?,?,?,?,0)`,
							).run(input.requestId, sessionId, input.message, context);
							d.prepare(
								`UPDATE ${config.namespace}_sessions SET value=? WHERE id=?`,
							).run(JSON.stringify(session), sessionId);
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
					config.operation,
					JSON.parse(turn!.context),
					z.toJSONSchema(config.answerSchema),
					`${config.namespace}-${input.requestId}`,
					{
						agent: config.agent,
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
										status: reading
											? 'reading'
											: reply
												? 'writing'
												: 'thinking',
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
					throw new StudyError(
						502,
						'The coach response could not be read. Retry this message.',
					);
				}
				const answer = config.answerSchema.safeParse(parsed);
				if (!answer.success)
					throw new StudyError(
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
							.prepare(
								`UPDATE ${config.namespace}_sessions SET value=? WHERE id=?`,
							)
							.run(JSON.stringify(session), sessionId);
						save
							.prepare(
								`UPDATE ${config.namespace}_turns SET complete=1 WHERE id=?`,
							)
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
			},
		);
	}

	async function discardTurn(sessionId: string, requestId: string) {
		validId(sessionId);
		validId(requestId);
		return locked(
			`${config.namespace}-session:${dataDir()}:${sessionId}`,
			async () => {
				const session = getSession(sessionId);
				if (session.pending?.id !== requestId) return session;
				session.pending = null;
				const d = db();
				try {
					d.exec('BEGIN IMMEDIATE');
					try {
						d.prepare(
							`UPDATE ${config.namespace}_turns SET complete=-1 WHERE id=? AND session_id=?`,
						).run(requestId, sessionId);
						d.prepare(
							`UPDATE ${config.namespace}_sessions SET value=? WHERE id=?`,
						).run(JSON.stringify(session), sessionId);
						d.exec('COMMIT');
					} catch (e) {
						d.exec('ROLLBACK');
						throw e;
					}
				} finally {
					d.close();
				}
				return session;
			},
		);
	}

	return { createSession, listSessions, getSession, runTurn, discardTurn };
}
