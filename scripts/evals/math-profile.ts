/** Adapter: real math runtime; fixture import is restricted to a fresh eval store. */
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { writeFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { defineDocFamily } from '@earendil-works/pi-durable';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { openAgentHarness } from '../../src/lib/server/agent';
import {
	saveConnection,
	selectConnection,
} from '../../src/lib/server/providers-store';
import {
	createMathSession,
	runMathTurn,
	getMathSession,
} from '../../src/lib/server/math/study';
import { learnerSchema, lessonCompletionSchema } from '../../src/lib/math';

const scenarioSchema = z.object({
	id: z.string(),
	initial: z.object({
		learner: learnerSchema,
		messages: z.array(
			z.object({ role: z.enum(['user', 'assistant']), content: z.string() }),
		),
	}),
	turns: z.array(z.string().min(1)).min(1).max(5),
});
// Same document identity as the runtime. Only session fixture data is replaced;
// existing native conversation, turns and index metadata remain owned by createStudy.
const FixtureSession = defineDocFamily<{ session: string }, string>({
	kind: 'app.study',
	version: 1,
	scope: 'session',
	family: true,
	initial: (session) => ({ session }),
	checkpointWhen: () => true,
});
function texts(file: string) {
	const db = new DatabaseSync(file, { readOnly: true });
	try {
		return (
			db.prepare('SELECT record FROM entries ORDER BY id').all() as {
				record: string;
			}[]
		)
			.map((row) => JSON.parse(row.record))
			.filter((entry) => entry.kind === 'pi.assistant')
			.flatMap((entry) =>
				(entry.model ?? [])
					.filter((m: any) => m.role === 'assistant')
					.map((m: any) => ({
						text: (m.content ?? [])
							.filter((c: any) => c.type === 'text')
							.map((c: any) => c.text)
							.join(''),
						tools: (m.content ?? [])
							.filter((c: any) => c.type === 'toolCall')
							.map((c: any) => ({ name: c.name, arguments: c.arguments })),
						usage: m.usage,
						durationMs: m.durationMs,
						stopReason: m.stopReason,
					})),
			);
	} finally {
		db.close();
	}
}
export async function runScenario(
	raw: unknown,
	runDir: string,
	config: { model: string; baseUrl: string },
) {
	const scenario = scenarioSchema.parse(raw); // Expectations never enter model context.
	const store = join(runDir, 'data');
	if (
		resolve(process.env.MR_KANE_DATA_DIR ?? '') !== resolve(store) ||
		!process.env.MR_KANE_EVAL_RUN
	)
		throw new Error('Refusing to run outside the isolated evaluation store.');
	const connection = saveConnection(
		{
			name: 'Isolated live eval',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: config.baseUrl,
			modelId: config.model,
			models: [config.model],
			protocol: 'openai-completions',
		},
		process.env.DEEPSEEK_API_KEY!,
	);
	selectConnection(connection.id);
	let session = await createMathSession();
	const file = join(store, 'study/math', `${session.id}.sqlite`);
	session = {
		...session,
		learner: scenario.initial.learner,
		messages: scenario.initial.messages.map((m) => ({
			...m,
			createdAt: new Date().toISOString(),
		})),
	};
	const opened = await openAgentHarness(file);
	try {
		await opened.harness.commit(async (tx) => {
			(await tx.doc(FixtureSession, session.id, '')).session =
				JSON.stringify(session);
		}, context);
	} finally {
		await opened.harness.close(context);
	}
	const before = structuredClone(session);
	async function saveEvidence() {
		const latest = await getMathSession(session.id).catch(() => session);
		const allTraces: Record<string, unknown> = { chat: texts(file) };
		for (const name of await readdir(join(store, 'requests')).catch(
			() => [] as string[],
		)) {
			if (name.endsWith('.sqlite'))
				allTraces[name] = texts(join(store, 'requests', name));
		}
		await writeFile(
			join(runDir, 'trace.json'),
			JSON.stringify(allTraces, null, 2),
		);
		await writeFile(
			join(runDir, 'session.json'),
			JSON.stringify({ before, after: latest }, null, 2),
		);
	}
	await saveEvidence();
	try {
		const turns = [];
		const started = Date.now();
		for (const input of scenario.turns) {
			const progress: { status: string; elapsedMs: number }[] = [];
			const start = Date.now();
			session = await runMathTurn(
				session.id,
				randomUUID(),
				input,
				undefined,
				(event) => {
					if (progress.at(-1)?.status !== event.status)
						progress.push({
							status: event.status,
							elapsedMs: Date.now() - start,
						});
				},
			);
			turns.push({
				input,
				reply: session.messages.at(-1)?.content,
				elapsedMs: Date.now() - start,
				profileStatus: session.profileUpdate,
				progress,
			});
			await writeFile(
				join(runDir, 'turns.json'),
				JSON.stringify(turns, null, 2),
			);
			await saveEvidence();
		}
		const trace = texts(file);
		const completion =
			trace
				.flatMap((t: any) => {
					try {
						const candidate = JSON.parse(
							t.text
								.replace(/^\s*```(?:json)?\s*/, '')
								.replace(/\s*```\s*$/, ''),
						).lessonCompletion;
						const checked = lessonCompletionSchema.safeParse(candidate);
						return checked.success ? [checked.data] : [];
					} catch {
						return [];
					}
				})
				.at(0) ?? null;
		let continuedChat: boolean | null = null;
		// A genuine follow-up uses the same runtime while consolidation may still run.
		if (completion) {
			const followup =
				'Could you briefly restate the idea we just used? Please do not start a new topic yet.';
			const next = await runMathTurn(session.id, randomUUID(), followup);
			continuedChat =
				next.pending === null && next.messages.at(-2)?.content === followup;
			session = next;
		}
		const deadline = Date.now() + 240000;
		while (session.profileUpdate === 'pending' && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 300));
			session = await getMathSession(session.id);
		}
		const observed = {
			completion,
			profileChanged:
				JSON.stringify(before.learner) !== JSON.stringify(session.learner),
			completed:
				session.learner.coursePlans?.some(
					(p) =>
						p.id === completion?.planId &&
						p.lessons.some(
							(l) =>
								l.courseId === completion?.courseId && l.status === 'completed',
						),
				) ?? false,
			turnSaved:
				session.messages.length >=
					before.messages.length + 2 * scenario.turns.length &&
				session.pending === null,
			continuedChat,
			profileStatus: session.profileUpdate ?? null,
			elapsedMs: Date.now() - started,
		};
		return observed;
	} finally {
		await saveEvidence();
	}
}
