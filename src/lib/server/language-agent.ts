import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgentDefinition } from './agent-runtime';
import { createSpeechTools } from './speech/tools';
import { requestSchema } from '#lib/domain';
import { research } from './research';

export function languageMetadata(snapshot: Record<string, unknown>) {
	return snapshot.research ? { research: snapshot.research } : undefined;
}

export function languageAgent(speechTools = false): AgentDefinition {
	return {
		// Keep the extension name used by existing durable conversations.
		id: 'language-coach',
		legacyMetadata: languageMetadata,
		legacyHashSuffix: speechTools ? '\nspeech-tools-enabled' : '',
		loadPrompt: () =>
			readFile(resolve('skills/language-coach/SKILL.md'), 'utf8'),
		createTools: ({ requestId }) =>
			speechTools ? createSpeechTools(requestId) : [],
		execution: {
			maxTurns: speechTools ? 4 : 1,
			streamTimeoutMs: 55000,
			timeoutMs: 60000,
		},
		async prepare(content, metadata) {
			const payload = JSON.parse(content);
			const practice =
				payload.operation === 'practice'
					? requestSchema.safeParse(payload.data)
					: null;
			if (
				!practice?.success ||
				practice.data.selectedVocabulary ||
				(practice.data.research === false &&
					practice.data.sourceType !== 'news') ||
				metadata?.research
			)
				return { content, metadata };
			const evidence = await research(practice.data);
			return {
				content: JSON.stringify({ ...payload, research: evidence }),
				metadata: { research: evidence },
			};
		},
	};
}
