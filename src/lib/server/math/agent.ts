import type { AgentDefinition } from '../agent-runtime';
import { modelFor } from '../providers-models';
import { mathSystemPrompt, createMathTools } from './library';
export const mathAgent: AgentDefinition = {
	id: 'aops-study',
	// Preserve the identity of requests admitted before subject adapters existed.
	legacyHashSuffix: '\nmath-coach',
	loadPrompt: mathSystemPrompt,
	createTools: ({ connection }) =>
		createMathTools(modelFor(connection).input.includes('image')),
	execution: { maxTurns: 6, streamTimeoutMs: 120000, timeoutMs: 180000 },
};
