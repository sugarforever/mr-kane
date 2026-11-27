import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import {
	defineDoc,
	defineTool,
	defineDocFamily,
	type Harness,
	type Conversation,
	type ConversationId,
	type SubmissionId,
} from '@earendil-works/pi-durable';
import { studyProgress } from '$lib/study-progress';
import { database, locked, dataDir } from '../providers-store';
import {
	runAgent,
	snapshotAgent,
	openAgentHarness,
	readAgentResponse,
	type AgentOptions,
	type AgentDefinition,
	type AgentSnapshot,
} from '../agent';
import {
	studyTurnSchema,
	type StudySession,
	type StudyMessage,
	type StudySummary,
} from '$lib/learning';
import type { StudyProgress } from '$lib/study-stream';

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
	replyFormat?: 'markdown';
	agent: AgentDefinition;
	emptyLearner: () => Learner;
	answerSchema: z.ZodType<{
		reply: string;
		learner?: Learner;
	}>;
	prepareSession?: (
		session: StudySession<Learner>,
	) => Promise<StudySession<Learner>>;
	persistLearner?: (
		next: Learner,
		previous: StudySession<Learner>,
	) => Promise<Learner>;
	checkpoint?: {
		saveSchema?: z.ZodType<unknown>;
		applySave?: (input: unknown, previous: Learner) => Learner;
		completionSchema: z.ZodType<LessonCompletion>;
		generate: (
			session: StudySession<Learner>,
			completion: LessonCompletion,
			requestId: string,
		) => Promise<Learner>;
		isComplete: (learner: Learner, completion: LessonCompletion) => boolean;
	};
	validateLearner?: (
		next: Learner,
		previous: Learner,
		messages: StudyMessage[],
	) => void;
};
export type LessonCompletion = { planId: string; courseId: string };
type ProfileJob = {
	completion: LessonCompletion;
	through: number;
	attempts: number;
	done: boolean;
	input?: string;
};
type Turn = {
	message: string;
	content: string;
	status: number;
	snapshot: string;
	submissionId: number | null;
	legacy: boolean;
	profile?: ProfileJob;
	completionRequested?: LessonCompletion;
	checkpointSaved?: boolean;
	replyFormat?: 'markdown';
};
// Session JSON preserves the public, subject-specific learner shape without constraining it to a shared profile.
const Study = defineDocFamily<
	{
		session: string;
		conversationId: number | null;
		turns: Record<string, Turn>;
	},
	string
>({
	kind: 'app.study',
	version: 1,
	scope: 'session',
	family: true,
	initial: (session) => ({ session, conversationId: null, turns: {} }),
	checkpointWhen: () => true,
});
const Index = defineDoc<{
	sessions: string[];
	requests: Record<string, { sessionId: string; message: string }>;
}>({
	kind: 'app.study-index',
	version: 1,
	scope: 'session',
	initial: () => ({ sessions: [], requests: {} }),
	checkpointWhen: () => true,
});
type Generate = (
	operation: string,
	data: unknown,
	schema: unknown,
	requestId: string,
	options: AgentOptions & { agent: AgentDefinition },
) => Promise<string>;

const profileWorkers = new Map<string, Promise<void>>();
const profileQueues = new Map<string, Promise<void>>();

export function createStudy<Learner>(config: StudyConfig<Learner>) {
	if (!/^[a-z][a-z0-9]{0,39}$/.test(config.namespace))
		throw new Error('Invalid study namespace.');
	type Session = StudySession<Learner>;
	const file = (id: string) =>
		join(dataDir(), 'study', config.namespace, `${id}.sqlite`);
	const validId = (id: string) => {
		if (!z.string().uuid().safeParse(id).success)
			throw new StudyError(400, 'Invalid conversation ID.');
	};

	// Compatibility import only. New sessions and turns never write the old SQL tables.
	async function importLegacy(harness: Harness) {
		if (await harness.snapshot(Index, context)) return;
		const db = database();
		let sessions: { value: string }[] = [];
		let turns: {
			id: string;
			session_id: string;
			message: string;
			context: string;
			complete: number;
		}[] = [];
		try {
			if (
				db
					.prepare('SELECT name FROM sqlite_master WHERE name=?')
					.get(`${config.namespace}_sessions`)
			) {
				sessions = db
					.prepare(`SELECT value FROM ${config.namespace}_sessions`)
					.all() as typeof sessions;
				turns = db
					.prepare(`SELECT * FROM ${config.namespace}_turns`)
					.all() as typeof turns;
			}
		} finally {
			db.close();
		}
		// The index never contains runnable conversations. Session stores are isolated
		// because Pi resumes every pending conversation in a harness when scheduling starts.
		for (const { value } of sessions) {
			const session = JSON.parse(value) as Session;
			await write(session.id, async ({ harness: store }) => {
				await store.commit(async (tx) => {
					const record = await tx.doc(Study, session.id, value);
					for (const turn of turns.filter((t) => t.session_id === session.id)) {
						record.turns[turn.id] = {
							message: turn.message,
							content: turn.context,
							status: turn.complete,
							snapshot: '',
							submissionId: null,
							legacy: true,
						};
					}
				}, context);
			});
		}
		await harness.commit(async (tx) => {
			const index = await tx.doc(Index);
			index.sessions = sessions.map(
				({ value }) => (JSON.parse(value) as Session).id,
			);
			for (const turn of turns)
				index.requests[turn.id] = {
					sessionId: turn.session_id,
					message: turn.message,
				};
		}, context);
	}
	async function write<T>(
		id: string,
		work: (opened: Awaited<ReturnType<typeof openAgentHarness>>) => Promise<T>,
	): Promise<T> {
		return locked(`study:${file(id)}`, async () => {
			const opened = await openAgentHarness(file(id), { compaction: true });
			try {
				return await work(opened);
			} finally {
				await opened.harness.close(context);
			}
		});
	}
	async function writeIndex<T>(
		work: (harness: Harness) => Promise<T>,
	): Promise<T> {
		return locked(`study:${file('index')}`, async () => {
			const { harness } = await openAgentHarness(file('index'));
			try {
				await importLegacy(harness);
				return await work(harness);
			} finally {
				await harness.close(context);
			}
		});
	}
	async function readIndex() {
		if (!existsSync(file('index'))) await writeIndex(async () => {});
		const { harness } = await openAgentHarness(file('index'), {
			readOnly: true,
		});
		try {
			const index = await harness.snapshot(Index, context);
			if (index) return index;
		} finally {
			await harness.close(context);
		}
		// A process may have stopped after creating storage but before finishing import.
		await writeIndex(async () => {});
		return readIndex();
	}
	async function recordFor(harness: Harness, id: string) {
		const record = await harness.snapshot(Study, id, context);
		if (!record) throw new StudyError(404, 'Conversation not found.');
		return record;
	}
	async function createSession(
		initial?: Pick<Session, 'learner' | 'lessonContext' | 'title'>,
	): Promise<Session> {
		await readIndex();
		const session: Session = {
			id: randomUUID(),
			title: config.title,
			updatedAt: new Date().toISOString(),
			learner: config.emptyLearner(),
			messages: [],
			pending: null,
			...initial,
		};
		await write(session.id, async ({ harness }) => {
			await harness.commit(async (tx) => {
				await tx.doc(Study, session.id, JSON.stringify(session));
			}, context);
		});
		await writeIndex(async (harness) => {
			await harness.commit(async (tx) => {
				(await tx.doc(Index)).sessions.push(session.id);
			}, context);
		});
		return session;
	}
	async function getSession(id: string): Promise<Session> {
		validId(id);
		if (!(await readIndex()).sessions.includes(id))
			throw new StudyError(404, 'Conversation not found.');
		const { harness } = await openAgentHarness(file(id), { readOnly: true });
		try {
			const session = JSON.parse(
				(await recordFor(harness, id)).session,
			) as Session;
			if (session.profileUpdate === 'pending') scheduleProfileUpdate(id);
			return session;
		} finally {
			await harness.close(context);
		}
	}
	async function mutateSession(
		id: string,
		update: (session: Session) => Promise<Session> | Session,
	) {
		validId(id);
		if (!(await readIndex()).sessions.includes(id))
			throw new StudyError(404, 'Conversation not found.');
		return write(id, async ({ harness }) => {
			const current = JSON.parse(
				(await recordFor(harness, id)).session,
			) as Session;
			const next = await update(current);
			await harness.commit(async (tx) => {
				(await tx.doc(Study, id, '')).session = JSON.stringify(next);
			}, context);
			return next;
		});
	}
	async function listSessions(): Promise<StudySummary[]> {
		const sessions = await Promise.all(
			(await readIndex()).sessions.map(getSession),
		);
		return sessions
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
	}
	async function hasRequest(requestId: string) {
		return !!(await readIndex()).requests[requestId];
	}
	async function reserveRequest(
		sessionId: string,
		requestId: string,
		message: string,
	) {
		await writeIndex(async (harness) => {
			await harness.commit(async (tx) => {
				const index = await tx.doc(Index);
				const owner = index.requests[requestId];
				if (
					owner &&
					(owner.sessionId !== sessionId || owner.message !== message)
				)
					throw new StudyError(
						409,
						'This request belongs to different content.',
					);
				index.requests[requestId] = { sessionId, message };
			}, context);
		});
	}

	function progressSink(
		onProgress?: (event: StudyProgress) => void,
	): AgentOptions['onProgress'] {
		return onProgress
			? ({ text, reading }) => {
					if (config.replyFormat === 'markdown') {
						onProgress({
							type: 'progress',
							reply: text.slice(0, 20000),
							status: reading ? 'reading' : text ? 'writing' : 'thinking',
						});
					} else onProgress(studyProgress(text, reading));
				}
			: undefined;
	}
	// Used only to import pre-Pi transcripts or exclude a discarded failed response from model context.
	const handoff = (session: Session) =>
		JSON.stringify({ learner: session.learner, messages: session.messages });
	async function runTurn(
		sessionId: string,
		requestId: string,
		message: string,
		generate?: Generate,
		onProgress?: (event: StudyProgress) => void,
	): Promise<Session> {
		validId(sessionId);
		const input = studyTurnSchema.parse({ requestId, message });
		if (!(await readIndex()).sessions.includes(sessionId))
			throw new StudyError(404, 'Conversation not found.');
		const result = await write(sessionId, async ({ harness, configure }) => {
			const record = await recordFor(harness, sessionId);
			let session = JSON.parse(record.session) as Session;
			if (config.prepareSession) session = await config.prepareSession(session);
			let turn = record.turns[input.requestId];
			if (turn && turn.message !== input.message)
				throw new StudyError(409, 'This request belongs to different content.');
			if (turn?.status === -1)
				throw new StudyError(
					409,
					'This message was discarded. Send it as a new message.',
				);
			if (turn?.status === 1) return session;
			if (session.pending && session.pending.id !== input.requestId)
				throw new StudyError(
					409,
					'Retry the pending message before sending another.',
				);
			if (!turn && session.messages.length >= 400)
				throw new StudyError(
					409,
					'Start a new conversation to continue studying.',
				);
			await reserveRequest(sessionId, input.requestId, input.message);
			const turnAgent: AgentDefinition = !config.checkpoint
				? config.agent
				: {
						...config.agent,
						loadPrompt: async () =>
							`${await config.agent.loadPrompt()}${session.lessonContext ? `\n\nBOUND LESSON\n${JSON.stringify(session.lessonContext)}\nStay within this lesson. Load teaching on entry, use the supplied learner and plan, resume outstanding work and retain assistance levels. Save progress with save_learning_checkpoint. Do not change other lessons or learner facts from this bound conversation.` : ''}`,
						createTools: (toolContext) => [
							...config.agent.createTools(toolContext),
							...(config.checkpoint!.saveSchema
								? [
										defineTool({
											name: 'get_learning_checkpoint',
											description:
												'Read the latest authoritative learner and plan. Use when resuming interrupted work or after a save conflict, then reconcile your update with this checkpoint.',
											parameters: z.toJSONSchema(z.object({}).strict()),
											replay: 'safe',
											async execute() {
												const current = JSON.parse(
													(await recordFor(harness, sessionId)).session,
												) as Session;
												if (current.pending?.id !== input.requestId)
													throw new Error('This turn is no longer pending.');
												const fresh = config.prepareSession
													? await config.prepareSession(current)
													: current;
												await harness.commit(async (tx) => {
													(await tx.doc(Study, sessionId, '')).session =
														JSON.stringify(fresh);
												}, context);
												session.learner = fresh.learner;
												return {
													output: [
														{
															type: 'text' as const,
															text: JSON.stringify({
																learner: fresh.learner,
																lessonContext: fresh.lessonContext ?? null,
															}),
														},
													],
												};
											},
										}),
										defineTool({
											name: 'save_learning_checkpoint',
											description:
												'Persist plans and progress now. Prefer incremental updates: provide only changed learner fields, plans and lessons keyed by id/courseId. Omitted fields, lessons and attempts are retained by the server. attempts are additions only; never regenerate or rewrite saved historical attempts. Use lessonOrder only to explicitly reorder/remove lessons. Use the legacy full learner only for small initial imports. Call before claiming a plan or progress is saved.',
											parameters: z.toJSONSchema(config.checkpoint!.saveSchema),
											replay: 'safe',
											async execute(raw) {
												const parsed =
													config.checkpoint!.saveSchema!.parse(raw);
												const current = JSON.parse(
													(await recordFor(harness, sessionId)).session,
												) as Session;
												if (current.pending?.id !== input.requestId)
													throw new Error('This turn is no longer pending.');
												const learner = config.checkpoint!.applySave
													? config.checkpoint!.applySave(
															parsed,
															current.learner,
														)
													: (parsed as { learner: Learner }).learner;
												const messages = [
													...current.messages,
													{
														role: 'user' as const,
														content: input.message,
														createdAt: new Date().toISOString(),
													},
												];
												config.validateLearner?.(
													learner,
													current.learner,
													messages,
												);
												const saved = config.persistLearner
													? await config.persistLearner(learner, {
															...current,
															messages,
														})
													: learner;
												current.learner = saved;
												await harness.commit(async (tx) => {
													const state = await tx.doc(Study, sessionId, '');
													state.session = JSON.stringify(current);
													state.turns[input.requestId].checkpointSaved = true;
												}, context);
												session.learner = saved;
												return {
													output: [
														{
															type: 'text' as const,
															text: JSON.stringify({
																status: 'saved',
																learner: saved,
															}),
														},
													],
												};
											},
										}),
									]
								: []),
							defineTool({
								name: 'complete_lesson',
								description:
									'Request background profile consolidation after assessment establishes a completed chapter lesson. Use its saved planId and courseId. Acceptance records the request, not verified mastery or a saved profile. Runs after this reply is saved.',
								parameters: z.toJSONSchema(config.checkpoint!.completionSchema),
								replay: 'safe',
								async execute(args) {
									const completion =
										config.checkpoint!.completionSchema.parse(args);
									if (
										session.lessonContext &&
										(completion.planId !== session.lessonContext.planId ||
											completion.courseId !== session.lessonContext.courseId)
									)
										throw new StudyError(409, 'Assess only the bound lesson.');
									const current = await recordFor(harness, sessionId);
									const saved = JSON.parse(current.session) as Session;
									if (saved.pending?.id !== input.requestId)
										throw new Error('This turn is no longer pending.');
									let status: 'accepted' | 'pending' | 'already-completed' =
										'accepted';
									if (config.checkpoint!.isComplete(saved.learner, completion))
										status = 'already-completed';
									else if (
										Object.values(current.turns).some(
											(t) =>
												t.profile &&
												!t.profile.done &&
												t.profile.attempts < 3 &&
												t.profile.completion.planId === completion.planId &&
												t.profile.completion.courseId === completion.courseId,
										)
									)
										status = 'pending';
									else {
										const previous =
											current.turns[input.requestId].completionRequested;
										if (
											previous &&
											(previous.planId !== completion.planId ||
												previous.courseId !== completion.courseId)
										)
											throw new Error('Complete one chapter per turn.');
										await harness.commit(async (tx) => {
											(await tx.doc(Study, sessionId, '')).turns[
												input.requestId
											].completionRequested = completion;
										}, context);
									}
									return {
										output: [
											{
												type: 'text',
												text: JSON.stringify({
													status,
													...completion,
													message:
														'The saved profile changes only after background validation succeeds.',
												}),
											},
										],
									};
								},
							}),
						],
					};
			const onAgentProgress = progressSink(onProgress);
			let conversation: Conversation | undefined;
			if (!turn) {
				const snapshot = generate ? undefined : await snapshotAgent(turnAgent);
				const content = JSON.stringify({
					operation: config.operation,
					data: {
						learner: session.learner,
						lessonContext: session.lessonContext ?? null,
						...(config.checkpoint
							? { profileUpdate: session.profileUpdate ?? null }
							: {}),
						messages: [{ role: 'user', content: input.message }],
						historyOmitted: false,
					},
					...(config.replyFormat !== 'markdown'
						? { outputSchema: z.toJSONSchema(config.answerSchema) }
						: {}),
				});
				if (snapshot) {
					const agent = configure(
						snapshot,
						turnAgent,
						`${config.namespace}-${requestId}`,
					);
					conversation = record.conversationId
						? (await harness.conversation(
								record.conversationId as ConversationId,
								context,
							))!
						: await harness.createConversation(
								{ ownership: { kind: 'ownerless' }, agent },
								context,
							);
					await conversation.configure(agent, context);
					if (!record.conversationId && session.messages.length)
						await conversation.reset(handoff(session), context);
				}
				turn = {
					message: input.message,
					content: snapshot ? '' : content,
					status: 0,
					snapshot: snapshot ? JSON.stringify(snapshot) : '',
					submissionId: null,
					legacy: false,
					...(config.replyFormat === 'markdown'
						? { replyFormat: 'markdown' as const }
						: {}),
				};
				session.pending = { id: input.requestId, message: input.message };
				await harness.commit(async (tx) => {
					// Pi admits the submission and pending application state in the same commit.
					if (conversation)
						turn.submissionId = await conversation.submit(tx, {
							type: 'input',
							requestId: input.requestId,
							content,
						});
					const state = await tx.doc(Study, sessionId, '');
					state.session = JSON.stringify(session);
					state.turns[input.requestId] = turn;
					if (conversation) state.conversationId = conversation.id;
				}, context);
			}
			let raw: string;
			if (turn.legacy || generate) {
				const data = turn.legacy
					? JSON.parse(turn.content)
					: JSON.parse(turn.content).data;
				let responseSchema: unknown =
					config.replyFormat === 'markdown'
						? undefined
						: z.toJSONSchema(config.answerSchema);
				let executionAgent = turnAgent;
				if (turn.legacy) {
					const db = database();
					try {
						const archived = db
							.prepare('SELECT snapshot FROM jobs WHERE id=?')
							.get(`${config.namespace}-${input.requestId}`) as
							{ snapshot: string } | undefined;
						responseSchema = archived
							? JSON.parse(JSON.parse(archived.snapshot).content).outputSchema
							: z.toJSONSchema(config.answerSchema);
					} finally {
						db.close();
					}
					executionAgent = {
						...turnAgent,
						loadPrompt: async () =>
							`${await turnAgent.loadPrompt()}\n\nLEGACY RESPONSE CONTRACT\nThis request was admitted with a JSON response contract. Return one JSON object matching outputSchema, with student-facing Markdown in reply.`,
					};
				}
				raw = await (
					generate ??
					((op, data, schema, id, options) =>
						runAgent(op, data, schema, id, options.agent, options))
				)(
					config.operation,
					data,
					responseSchema,
					`${config.namespace}-${input.requestId}`,
					{ agent: executionAgent, onProgress: onAgentProgress },
				);
			} else {
				const snapshot = JSON.parse(turn.snapshot) as AgentSnapshot;
				if (snapshot.agentId !== config.agent.id)
					throw new StudyError(
						409,
						'This request belongs to a different agent.',
					);
				const agent = configure(
					snapshot,
					turnAgent,
					`${config.namespace}-${requestId}`,
				);
				conversation ??= (await harness.conversation(
					record.conversationId as ConversationId,
					context,
				))!;
				await conversation.configure(agent, context);
				const previous = await harness.submission(
					turn.submissionId as SubmissionId,
					context,
				);
				const status = await previous?.status(context);
				if (status?.status === 'unanswered') {
					// Pi owns recovery of work still placed/queued. A terminal failed run needs a
					// new native continuation, without appending the student's message again.
					await harness.commit(async (tx) => {
						const id = await conversation!.submit(tx, {
							type: 'continue',
							requestId: `${input.requestId}-retry-${randomUUID()}`,
						});
						(await tx.doc(Study, sessionId, '')).turns[
							input.requestId
						].submissionId = id;
						turn = { ...turn, submissionId: id };
					}, context);
				}
				raw = await readAgentResponse(
					harness,
					conversation,
					turn.submissionId as SubmissionId,
					snapshot.execution!.timeoutMs,
					onAgentProgress,
				);
			}
			let parsed: unknown;
			try {
				parsed =
					config.replyFormat === 'markdown' && turn.replyFormat === 'markdown'
						? { reply: raw }
						: JSON.parse(
								raw
									.replace(/^\s*```(?:json)?\s*/, '')
									.replace(/\s*```\s*$/, ''),
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
			try {
				if (answer.data.learner !== undefined && !config.checkpoint)
					config.validateLearner?.(answer.data.learner, session.learner, [
						...session.messages,
						{
							role: 'user',
							content: input.message,
							createdAt: new Date().toISOString(),
						},
					]);
			} catch {
				throw new StudyError(
					502,
					'The coach returned an invalid learning record. Retry this message.',
				);
			}
			onProgress?.({
				type: 'progress',
				reply: answer.data.reply,
				status: 'saving',
			});
			const now = new Date().toISOString();
			session = {
				...session,
				title:
					session.lessonContext || session.messages.length
						? session.title
						: input.message.slice(0, 70),
				learner: config.checkpoint
					? session.learner
					: (answer.data.learner ?? session.learner),
				messages: [
					...session.messages,
					{ role: 'user', content: input.message, createdAt: now },
					{ role: 'assistant', content: answer.data.reply, createdAt: now },
				],
				updatedAt: now,
				pending: null,
			};
			const latest = await recordFor(harness, sessionId);
			const legacyCompletion =
				config.checkpoint && turn.replyFormat !== 'markdown'
					? config.checkpoint.completionSchema.safeParse(
							(parsed as { lessonCompletion?: unknown })?.lessonCompletion,
						)
					: undefined;
			const completion =
				latest.turns[input.requestId].completionRequested ??
				(legacyCompletion?.success ? legacyCompletion.data : undefined);
			const needsProfile =
				config.checkpoint &&
				completion &&
				!config.checkpoint.isComplete(session.learner, completion) &&
				!Object.values(latest.turns).some(
					(t) =>
						t.profile &&
						!t.profile.done &&
						t.profile.attempts < 3 &&
						t.profile.completion.planId === completion.planId &&
						t.profile.completion.courseId === completion.courseId,
				);
			if (needsProfile) session.profileUpdate = 'pending';
			await harness.commit(async (tx) => {
				const state = await tx.doc(Study, sessionId, '');
				if (needsProfile) {
					// A new completion assessment supersedes exhausted work for this lesson.
					for (const old of Object.values(state.turns)) {
						if (
							old.profile &&
							!old.profile.done &&
							old.profile.attempts >= 3 &&
							old.profile.completion.planId === completion.planId &&
							old.profile.completion.courseId === completion.courseId
						) {
							old.profile.done = true;
							delete old.profile.input;
						}
					}
					state.turns[input.requestId].profile = {
						completion,
						through: session.messages.length,
						attempts: 0,
						done: false,
					};
				}
				state.session = JSON.stringify(session);
				state.turns[input.requestId].status = 1;
				state.turns[input.requestId].snapshot = '';
				state.turns[input.requestId].content = '';
			}, context);
			return session;
		}).catch((error: unknown) => {
			if (error instanceof Error && error.name === 'TimeoutError')
				throw new StudyError(
					504,
					'The coach timed out before finishing. Your conversation and previously saved progress are preserved. Retry this message to continue.',
				);
			throw error;
		});
		if (result.profileUpdate === 'pending') scheduleProfileUpdate(sessionId);
		return result;
	}

	function scheduleProfileUpdate(id: string) {
		if (!config.checkpoint) return;
		const key = file(id);
		if (profileWorkers.has(key)) return;
		// A separate lease serializes consolidation without holding the chat write lock.
		const root = dataDir();
		const previous = profileQueues.get(root) ?? Promise.resolve();
		const worker = previous
			.then(() => locked(`profile:${key}`, () => updateProfiles(id)))
			.catch((error) =>
				console.error(
					'Profile consolidation failed:',
					error instanceof Error ? error.message : 'unknown error',
				),
			)
			.finally(() => {
				profileWorkers.delete(key);
				if (profileQueues.get(root) === worker) profileQueues.delete(root);
			});
		profileWorkers.set(key, worker);
		profileQueues.set(root, worker);
	}
	async function updateProfiles(id: string) {
		for (;;) {
			const claimed = await write(id, async ({ harness }) => {
				const record = await recordFor(harness, id);
				const item = Object.entries(record.turns).find(
					([, t]) => t.profile && !t.profile.done && t.profile.attempts < 3,
				);
				if (!item) return;
				const [requestId, turn] = item;
				const job = turn.profile!;
				const current = JSON.parse(record.session) as Session;
				const input =
					job.input ??
					JSON.stringify({
						...current,
						pending: null,
						messages: current.messages.slice(0, job.through),
					});
				await harness.commit(async (tx) => {
					const saved = (await tx.doc(Study, id, '')).turns[requestId].profile!;
					saved.input = input;
				}, context);
				return {
					requestId,
					job,
					session: JSON.parse(input) as Session,
					attempt: job.attempts + 1,
				};
			});
			if (!claimed) return;
			let learner: Learner | undefined;
			let failed = false;
			try {
				learner = await config.checkpoint!.generate(
					claimed.session,
					claimed.job.completion,
					`profile-${claimed.requestId}-${claimed.attempt}`,
				);
				config.validateLearner?.(
					learner,
					claimed.session.learner,
					claimed.session.messages,
				);
				if (!config.checkpoint!.isComplete(learner, claimed.job.completion))
					throw new Error('Requested lesson is not complete.');
			} catch {
				failed = true;
			}
			await write(id, async ({ harness }) => {
				const record = await recordFor(harness, id);
				const current = JSON.parse(record.session) as Session;
				await harness.commit(async (tx) => {
					const state = await tx.doc(Study, id, '');
					const job = state.turns[claimed.requestId].profile!;
					if (failed) job.attempts++;
					if (!failed) {
						// Merge into the latest session, retaining messages and any pending chat.
						// A background result must not overwrite a more recent live checkpoint.
						if (
							JSON.stringify(current.learner) !==
							JSON.stringify(claimed.session.learner)
						) {
							job.done = true;
							current.profileUpdate = 'failed';
							state.session = JSON.stringify(current);
							return;
						}
						try {
							current.learner = config.persistLearner
								? await config.persistLearner(learner!, claimed.session)
								: learner!;
							job.done = true;
							delete job.input;
						} catch {
							// Persistence conflicts are terminal for this stale input, not a new model request.
							job.attempts = 3;
						}
					}
					const outstanding = Object.values(state.turns).filter(
						(t) => t.profile && !t.profile.done,
					);
					current.profileUpdate = outstanding.some(
						(t) => t.profile!.attempts < 3,
					)
						? 'pending'
						: outstanding.length
							? 'failed'
							: undefined;
					state.session = JSON.stringify(current);
				}, context);
			});
		}
	}
	async function discardTurn(
		sessionId: string,
		requestId: string,
	): Promise<Session> {
		validId(sessionId);
		validId(requestId);
		if (!(await readIndex()).sessions.includes(sessionId))
			throw new StudyError(404, 'Conversation not found.');
		return write(sessionId, async ({ harness, configure }) => {
			const record = await recordFor(harness, sessionId);
			const session = JSON.parse(record.session) as Session;
			if (session.pending?.id !== requestId) return session;
			const conversation = record.conversationId
				? await harness.conversation(
						record.conversationId as ConversationId,
						context,
					)
				: undefined;
			const pending = record.turns[requestId];
			if (pending?.snapshot)
				configure(
					JSON.parse(pending.snapshot),
					config.agent,
					`${config.namespace}-${requestId}`,
				);
			await conversation?.abort(context);
			if (pending?.checkpointSaved)
				session.messages.push({
					role: 'user',
					content: pending.message,
					createdAt: new Date().toISOString(),
				});
			session.pending = null;
			await harness.commit(async (tx) => {
				if (conversation)
					await conversation.submit(tx, {
						type: 'write',
						entry: {
							kind: 'pi.reset',
							head: 'self',
							model: [
								{
									role: 'user',
									content: handoff(session),
									timestamp: Date.now(),
								},
							],
						},
					});
				const state = await tx.doc(Study, sessionId, '');
				state.session = JSON.stringify(session);
				state.turns[requestId].status = -1;
			}, context);
			return session;
		});
	}
	return {
		createSession,
		mutateSession,
		listSessions,
		getSession,
		runTurn,
		discardTurn,
		hasRequest,
		resumeProfileUpdates: async () => {
			await listSessions();
		},
	};
}
