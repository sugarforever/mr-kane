// Compatibility entry point for existing language API consumers.
import { randomUUID } from 'node:crypto';
import {
	runAgent,
	agentMetadata,
	type AgentOptions,
	type AgentDefinition,
} from './agent-runtime';
import { languageAgent, languageMetadata } from './language-agent';
import type { research } from './research';
export {
	configured,
	hasAgentRequest as hasCoachRequest,
	runAgent,
} from './agent-runtime';
export type {
	AgentDefinition,
	AgentOptions,
	AgentProgress as CoachProgress,
} from './agent-runtime';
export type CoachOptions = AgentOptions & {
	agent?: AgentDefinition;
	speechTools?: boolean;
};
export function runCoach(
	operation: string,
	data: unknown,
	schema: unknown,
	requestId: string = randomUUID(),
	options: CoachOptions = {},
) {
	return runAgent(
		operation,
		data,
		schema,
		requestId,
		options.agent ?? languageAgent(options.speechTools),
		options,
	);
}
export function coachSources(id: string) {
	const evidence = agentMetadata(id, languageMetadata)?.research as
		Awaited<ReturnType<typeof research>> | undefined;
	return {
		sources: evidence?.sources || [],
		searchedAt: evidence?.searchedAt,
		searchQuery: evidence?.query,
	};
}
