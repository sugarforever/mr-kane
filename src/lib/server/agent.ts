import { readFile } from 'node:fs/promises';
import { mkdirSync, closeSync, openSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
	BACKGROUND_CONTEXT as context,
	withAbortSignal,
} from '@earendil-works/chord/context';
import {
	Harness,
	createRegistry,
	AssistantEntry,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import {
	database,
	dataDir,
	defaultConnection,
	publicConnection,
	locked,
} from './providers-store';
import { modelsFor, modelFor } from './providers-models';
import { research } from './research';
import { createSpeechTools } from './speech/tools';
import { mathSystemPrompt, createMathTools } from './math/library';
import { requestSchema } from '#lib/domain';
import type { Connection } from '#lib/ai-types';
export const configured = () => {
	const p = defaultConnection();
	return !!p && publicConnection(p).connected;
};
type Snapshot = {
	connection: Connection;
	skill: string;
	content: string;
	research?: Awaited<ReturnType<typeof research>>;
	speechTools?: boolean;
	coach?: 'math';
};
const state = globalThis as typeof globalThis & {
	__kaneJobs?: Map<string, Promise<string>>;
};
const jobs = (state.__kaneJobs ??= new Map<string, Promise<string>>());
export async function runCoach(
	operation: string,
	data: unknown,
	schema: unknown,
	requestId: string = randomUUID(),
	options: { speechTools?: boolean; coach?: 'math' } = {},
): Promise<string> {
	if (!/^[a-zA-Z0-9-]{1,80}$/.test(requestId))
		throw new Error('Invalid request ID.');
	const content = JSON.stringify({ operation, data, outputSchema: schema });
	const coachContent =
		options.coach === 'math' ? content + '\nmath-coach' : content;
	const hashContent = options.speechTools
		? coachContent + '\nspeech-tools-enabled'
		: coachContent;
	const hash = createHash('sha256').update(hashContent).digest('hex');
	const connection = defaultConnection();
	const db = database();
	let snapshot: Snapshot;
	try {
		const saved = db
			.prepare('SELECT hash,snapshot FROM jobs WHERE id=?')
			.get(requestId) as { hash: string; snapshot: string } | undefined;
		if (saved) {
			if (saved.hash !== hash)
				throw new Error('This request ID belongs to different content.');
			snapshot = JSON.parse(saved.snapshot);
		} else {
			if (!connection || !publicConnection(connection).connected)
				throw new Error('Connect an AI provider in Settings first.');
			snapshot = {
				connection,
				coach: options.coach,
				speechTools: options.speechTools === true,
				skill:
					options.coach === 'math'
						? await mathSystemPrompt()
						: await readFile(resolve('skills/language-coach/SKILL.md'), 'utf8'),
				content,
			};
			db.prepare('INSERT OR IGNORE INTO jobs VALUES (?,?,?)').run(
				requestId,
				hash,
				JSON.stringify(snapshot),
			);
			const admitted = db
				.prepare('SELECT hash,snapshot FROM jobs WHERE id=?')
				.get(requestId) as { hash: string; snapshot: string };
			if (admitted.hash !== hash)
				throw new Error('This request ID belongs to different content.');
			snapshot = JSON.parse(admitted.snapshot);
		}
	} finally {
		db.close();
	}
	const key = `${dataDir()}:${requestId}`;
	const existing = jobs.get(key);
	if (existing) return existing;
	if (jobs.size >= 2)
		throw new Error(
			'Other practices are being prepared. Please retry shortly.',
		);
	const promise = locked(`job:${key}`, () => execute(snapshot, requestId));
	jobs.set(key, promise);
	try {
		return await promise;
	} finally {
		jobs.delete(key);
	}
}
async function execute(snapshot: Snapshot, id: string) {
	// A different process may have completed research while this worker waited for the lease.
	const currentDb = database();
	try {
		const row = currentDb
			.prepare('SELECT snapshot FROM jobs WHERE id=?')
			.get(id) as { snapshot: string } | undefined;
		if (row) snapshot = JSON.parse(row.snapshot);
	} finally {
		currentDb.close();
	}

	const payload = JSON.parse(snapshot.content);
	const practice =
		payload.operation === 'practice'
			? requestSchema.safeParse(payload.data)
			: null;
	if (
		practice?.success &&
		!practice.data.selectedVocabulary &&
		(practice.data.research !== false || practice.data.sourceType === 'news') &&
		!snapshot.research
	) {
		snapshot.research = await research(practice.data);
		snapshot.content = JSON.stringify({
			...payload,
			research: snapshot.research,
		});
		const db = database();
		try {
			db.prepare('UPDATE jobs SET snapshot=? WHERE id=?').run(
				JSON.stringify(snapshot),
				id,
			);
		} finally {
			db.close();
		}
	}

	const dir = join(dataDir(), 'requests');
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const file = join(dir, `${id}.sqlite`);
	closeSync(openSync(file, 'a', 0o600));
	chmodSync(file, 0o600);
	const registry = createRegistry();
	const speechTools = createSpeechTools(id);
	const activeTools =
		snapshot.coach === 'math'
			? createMathTools(modelFor(snapshot.connection).input.includes('image'))
			: snapshot.speechTools
				? speechTools
				: [];
	registry.install({
		name: snapshot.coach === 'math' ? 'aops-study' : 'language-coach',
		tools: snapshot.coach === 'math' ? activeTools : speechTools,
		sections: [{ key: 'teaching', tag: false, render: () => snapshot.skill }],
	});
	const storage = await openNodeSqliteStorage(file);
	let harness: Harness;
	try {
		harness = await Harness.open(
			storage,
			{
				models: modelsFor(snapshot.connection),
				registry,
				settings: {
					retry: { enabled: true, maxRetries: 1, baseDelayMs: 100 },
					compaction: { enabled: false },
					stream: { maxRetries: 0, timeoutMs: 55000 },
				},
			},
			context,
		);
	} catch (e) {
		await storage.close(context);
		throw e;
	}
	try {
		const root = await harness.root(context, {
			agent: {
				model: {
					provider: snapshot.connection.service,
					modelId: snapshot.connection.modelId,
				},
				tools: activeTools,
				thinkingLevel: 'off',
				maxTurns: snapshot.coach === 'math' ? 6 : snapshot.speechTools ? 4 : 1,
			},
		});
		const submission = await root.submit(
			{ type: 'input', requestId: id, content: snapshot.content },
			context,
		);
		const settled = await submission.wait(
			withAbortSignal(AbortSignal.timeout(60000), context),
		);
		if (settled.status !== 'done' || settled.type !== 'input')
			throw new Error(
				'The model request failed. Check the connection and retry.',
			);
		const answer = await root.commit(
			(tx) => tx.entry(AssistantEntry, settled.answer),
			context,
		);
		const text = answer?.model
			?.flatMap((m) =>
				m.role === 'assistant'
					? m.content.flatMap((c) => (c.type === 'text' ? [c.text] : []))
					: [],
			)
			.join('');
		if (!text) throw new Error('The model returned no text.');
		return text;
	} finally {
		await harness.close(context);
	}
}

export function hasCoachRequest(id: string | null) {
	if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return false;
	const db = database();
	try {
		return !!db.prepare('SELECT id FROM jobs WHERE id=?').get(id);
	} finally {
		db.close();
	}
}

export function coachSources(id: string) {
	const db = database();
	try {
		const row = db.prepare('SELECT snapshot FROM jobs WHERE id=?').get(id) as
			{ snapshot: string } | undefined;
		const evidence = row
			? (JSON.parse(row.snapshot) as Snapshot).research
			: undefined;
		return {
			sources: evidence?.sources || [],
			searchedAt: evidence?.searchedAt,
			searchQuery: evidence?.query,
		};
	} finally {
		db.close();
	}
}
