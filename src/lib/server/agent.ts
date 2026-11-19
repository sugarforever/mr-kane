import { mkdirSync, closeSync, openSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
	BACKGROUND_CONTEXT as context,
	withAbortSignal,
} from '@earendil-works/chord/context';
import {
	Harness,
	createRegistry,
	AssistantEntry,
	type ConversationView,
	type ConversationWatch,
	type LiveState,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import {
	database,
	dataDir,
	defaultConnection,
	publicConnection,
	locked,
} from './providers-store';
import { modelsFor } from './providers-models';
import { createModels } from '@earendil-works/pi-ai/models';
import type { Connection } from '#lib/ai-types';
export const configured = () => {
	const p = defaultConnection();
	return !!p && publicConnection(p).connected;
};
export type AgentExecution = {
	maxTurns: number;
	streamTimeoutMs: number;
	timeoutMs: number;
};
export type AgentDefinition = {
	/** Stable, versioned identity for prompt/tool semantics. Change it when compatibility changes. */
	id: string;
	loadPrompt: () => Promise<string>;
	createTools: (context: {
		requestId: string;
		connection: Connection;
	}) => import('@earendil-works/pi-durable').ToolRegistration[];
	execution: AgentExecution;
	prepare?: (
		content: string,
		metadata?: Record<string, unknown>,
	) => Promise<{ content: string; metadata?: Record<string, unknown> }>;
	/** Only for adapters that must resume jobs written before agent identities existed. */
	legacyHashSuffix?: string;
	legacyMetadata?: (
		snapshot: Record<string, unknown>,
	) => Record<string, unknown> | undefined;
};
export type AgentSnapshot = {
	connection: Connection;
	skill: string;
	content: string;
	agentId?: string;
	execution?: AgentExecution;
	metadata?: Record<string, unknown>;
	[key: string]: unknown;
};
const state = globalThis as typeof globalThis & {
	__kaneJobs?: Map<string, Promise<string>>;
};
const jobs = (state.__kaneJobs ??= new Map<string, Promise<string>>());
export type AgentProgress = { text: string; reading: boolean };
export type AgentOptions = { onProgress?: (progress: AgentProgress) => void };
export async function runAgent(
	operation: string,
	data: unknown,
	schema: unknown,
	requestId: string = randomUUID(),
	definition: AgentDefinition,
	options: AgentOptions = {},
): Promise<string> {
	if (!/^[a-zA-Z0-9-]{1,80}$/.test(requestId))
		throw new Error('Invalid request ID.');
	const content = JSON.stringify({ operation, data, outputSchema: schema });
	const hashContent =
		content + (definition.legacyHashSuffix ?? `\nagent:${definition.id}`);
	const hash = createHash('sha256').update(hashContent).digest('hex');
	const connection = defaultConnection();
	const db = database();
	let snapshot: AgentSnapshot;
	try {
		const saved = db
			.prepare('SELECT hash,snapshot FROM jobs WHERE id=?')
			.get(requestId) as { hash: string; snapshot: string } | undefined;
		if (saved) {
			if (saved.hash !== hash)
				throw new Error('This request ID belongs to different content.');
			snapshot = JSON.parse(saved.snapshot);
			if (snapshot.agentId && snapshot.agentId !== definition.id)
				throw new Error('This request ID belongs to a different agent.');
		} else {
			if (!connection || !publicConnection(connection).connected)
				throw new Error('Connect an AI provider in Settings first.');
			snapshot = {
				connection,
				agentId: definition.id,
				execution: definition.execution,
				skill: await definition.loadPrompt(),
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
			if (snapshot.agentId && snapshot.agentId !== definition.id)
				throw new Error('This request ID belongs to a different agent.');
		}
	} finally {
		db.close();
	}
	const key = `${dataDir()}:${requestId}`;
	const existing = jobs.get(key);
	if (existing) return existing;
	if (jobs.size >= 2)
		throw new Error('Other requests are being prepared. Please retry shortly.');
	const promise = locked(`job:${key}`, () =>
		execute(snapshot, requestId, definition, options.onProgress),
	);
	jobs.set(key, promise);
	try {
		return await promise;
	} finally {
		jobs.delete(key);
	}
}
async function execute(
	snapshot: AgentSnapshot,
	id: string,
	definition: AgentDefinition,
	onProgress?: AgentOptions['onProgress'],
) {
	// A different process may have prepared context while this worker waited for the lease.
	const currentDb = database();
	try {
		const row = currentDb
			.prepare('SELECT snapshot FROM jobs WHERE id=?')
			.get(id) as { snapshot: string } | undefined;
		if (row) snapshot = JSON.parse(row.snapshot);
	} finally {
		currentDb.close();
	}

	const execution = snapshot.execution ?? definition.execution;
	if (definition.prepare) {
		const prepared = await definition.prepare(
			snapshot.content,
			snapshot.metadata ?? definition.legacyMetadata?.(snapshot),
		);
		snapshot.content = prepared.content;
		snapshot.metadata = prepared.metadata;
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

	const file = join(dataDir(), 'requests', `${id}.sqlite`);
	const { harness, configure } = await openAgentHarness(file);
	try {
		const agent = configure(snapshot, definition, id);
		const root = await harness.root(context, { agent });
		const submission = await root.submit(
			{ type: 'input', requestId: id, content: snapshot.content },
			context,
		);
		return await readAgentResponse(
			harness,
			root,
			submission.id,
			execution.timeoutMs,
			onProgress,
		);
	} finally {
		await harness.close(context);
	}
}

/** Provider/registry integration only; conversations, submissions and documents are Pi primitives. */
export async function openAgentHarness(
	file: string,
	options: { readOnly?: boolean; compaction?: boolean } = {},
) {
	const readOnly = options.readOnly ?? false;
	if (!readOnly) {
		mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
		closeSync(openSync(file, 'a', 0o600));
		chmodSync(file, 0o600);
	}
	const registry = createRegistry();
	let models = createModels();
	let execution: AgentExecution | undefined;
	const storage = await openNodeSqliteStorage(file);
	let harness: Harness;
	try {
		harness = await Harness.open(
			storage,
			{
				models: () => models,
				registry,
				readOnly,
				settings: () => ({
					retry: { enabled: true, maxRetries: 1, baseDelayMs: 100 },
					compaction: { enabled: options.compaction ?? false },
					stream: {
						maxRetries: 0,
						timeoutMs: execution?.streamTimeoutMs ?? 55000,
					},
				}),
			},
			context,
		);
	} catch (e) {
		await storage.close(context);
		throw e;
	}
	return {
		harness,
		configure(
			snapshot: AgentSnapshot,
			definition: AgentDefinition,
			requestId: string,
		) {
			models = modelsFor(snapshot.connection);
			execution = snapshot.execution ?? definition.execution;
			const tools = definition.createTools({
				requestId,
				connection: snapshot.connection,
			});
			registry.install({
				name: definition.id,
				tools,
				sections: [
					{ key: 'teaching', tag: false, render: () => snapshot.skill },
				],
			});
			return {
				model: {
					provider: snapshot.connection.service,
					modelId: snapshot.connection.modelId,
				},
				tools,
				thinkingLevel: 'off' as const,
				maxTurns: execution.maxTurns,
			};
		},
	};
}

export async function snapshotAgent(
	definition: AgentDefinition,
): Promise<AgentSnapshot> {
	const connection = defaultConnection();
	if (!connection || !publicConnection(connection).connected)
		throw new Error('Connect an AI provider in Settings first.');
	return {
		connection,
		skill: await definition.loadPrompt(),
		content: '',
		agentId: definition.id,
		execution: definition.execution,
	};
}

export async function readAgentResponse(
	harness: Harness,
	conversation: import('@earendil-works/pi-durable').Conversation,
	submissionId: import('@earendil-works/pi-durable').SubmissionId,
	timeoutMs: number,
	onProgress?: AgentOptions['onProgress'],
) {
	let watch: ConversationWatch | undefined;
	try {
		if (onProgress) {
			const publish = (view: ConversationView) => {
				const live = view.docs['pi.live'] as LiveState | undefined;
				const message = live?.generation?.message;
				const reading =
					live?.tools?.some((tool) => tool.status !== 'done') ?? false;
				if (!message && !reading) return;
				const text =
					message?.content
						.flatMap((c) => (c.type === 'text' ? [c.text] : []))
						.join('') ?? '';
				onProgress({ text, reading });
			};
			watch = await conversation.watch(context);
			publish(watch.value);
			watch.start(async (call) => {
				if (call.kind === 'value') publish(call.value);
			});
		}
		const submission = await harness.submission(submissionId, context);
		if (!submission) throw new Error('The saved submission was not found.');
		const settled = await submission.wait(
			withAbortSignal(AbortSignal.timeout(timeoutMs), context),
		);
		if (settled.status !== 'done' || settled.type === 'write')
			throw new Error(
				'The model request failed. Check the connection and retry.',
			);
		const answer = await conversation.commit(
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
		await watch?.stop();
	}
}

export function hasAgentRequest(id: string | null) {
	if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return false;
	const db = database();
	try {
		return !!db.prepare('SELECT id FROM jobs WHERE id=?').get(id);
	} finally {
		db.close();
	}
}

export function agentMetadata(
	id: string,
	legacyMetadata?: AgentDefinition['legacyMetadata'],
): Record<string, unknown> | undefined {
	const db = database();
	try {
		const row = db.prepare('SELECT snapshot FROM jobs WHERE id=?').get(id) as
			{ snapshot: string } | undefined;
		if (!row) return;
		const snapshot = JSON.parse(row.snapshot) as AgentSnapshot;
		return snapshot.metadata ?? legacyMetadata?.(snapshot);
	} finally {
		db.close();
	}
}
