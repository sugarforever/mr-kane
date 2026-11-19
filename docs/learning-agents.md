# Learning agents

`server/agent-runtime.ts` executes durable model requests without selecting a subject. An `AgentDefinition` supplies a prompt loader, a tool factory and execution budgets. Its stable ID identifies compatible prompt/tool semantics; use a new ID for incompatible changes. The first admitted request snapshots its provider, prompt, content and budgets. Reusing a request ID with different input or agent identity is rejected.

The language adapter owns practice research and optional speech tools. `server/agent.ts` retains the existing `runCoach` interface for language endpoints, and accepts an `agent` option for callers that already inject a generator. The math adapter owns AoPS prompts, retrieval tools and longer execution budgets. New subjects should call `runAgent` or use the study factory directly.

`createStudy` in `server/learning/study.ts` accepts a namespace, title, operation, agent, initial learner factory and Zod answer schema. The schema returns `{ reply: string, learner: SubjectLearner }`; the learner can have any subject-specific shape. Namespace values are lowercase ASCII letters/digits, beginning with a letter, at most 40 characters. A namespace is a permanent storage boundary: do not reuse one for an unrelated subject or incompatible profile schema.

The returned functions create/list/read sessions, run turns and discard pending turns. Each turn freezes its bounded history and learner context before generation. Validation precedes the transaction that saves the reply, learner and completion marker together. Failed turns remain pending and reuse their original context; discarded IDs cannot be submitted again. Math uses its original namespace and tables, so existing conversations need no migration.

`studyResponse(run, errorMessage)` sends NDJSON progress and completion with backpressure and heartbeats. Cancellation stops delivery and its heartbeat while the operation continues saving. The route supplies a safe error formatter, authentication/access checks and any non-streaming JSON response. `readStudyStream<Session>` consumes the transport and always cancels/releases its reader. Study progress extracts only the top-level reply from partial structured output; profile JSON and tool arguments stay outside student-facing text. Subject pages own their presentation and rendering.

The history fixtures in `tests/learning-session.test.ts` and `tests/learning-agent.test.ts` demonstrate reuse with a different learner schema and archive tool. They are tests, not an additional shipped subject. Existing math exports remain compatibility aliases, including `readMathStream`.

Legacy hash suffixes and metadata readers exist only to resume previously admitted math and language jobs. New adapters should use the default agent identity hash and structured metadata.
