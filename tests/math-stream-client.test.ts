import { expect, it } from 'vitest';
import { readMathStream } from '../src/lib/math-stream';
import { emptyLearner, type MathSession } from '../src/lib/math';
const session: MathSession = {
	id: 'saved',
	title: 'Math',
	updatedAt: '',
	messages: [],
	learner: emptyLearner(),
	pending: null,
};
function response(events: unknown[], truncate = false) {
	const bytes = new TextEncoder().encode(
		events.map((e) => JSON.stringify(e)).join('\n') + (truncate ? '' : '\n'),
	);
	let offset = 0;
	return new Response(
		new ReadableStream({
			pull(controller) {
				if (offset === bytes.length) return controller.close();
				controller.enqueue(bytes.slice(offset, ++offset));
			},
		}),
		{ headers: { 'Content-Type': 'application/x-ndjson' } },
	);
}
it('decodes split UTF-8 and NDJSON while publishing progress before completion', async () => {
	const seen: unknown[] = [];
	const result = await readMathStream(
		response([
			{ type: 'progress', reply: 'π = "pi"\n$x$', status: 'writing' },
			{ type: 'complete', session },
		]),
		(event) => seen.push(event),
	);
	expect(seen).toEqual([
		{ type: 'progress', reply: 'π = "pi"\n$x$', status: 'writing' },
	]);
	expect(result).toEqual(session);
});
it('accepts a final event without a newline', async () => {
	expect(
		await readMathStream(
			response([{ type: 'complete', session }], true),
			() => {},
		),
	).toEqual(session);
});
it('rejects an interrupted stream instead of treating a partial reply as saved', async () => {
	await expect(
		readMathStream(
			response([{ type: 'progress', reply: 'partial', status: 'writing' }]),
			() => {},
		),
	).rejects.toThrow(/interrupted|retry/i);
});
it('surfaces server errors and JSON errors before the stream starts', async () => {
	await expect(
		readMathStream(
			response([{ type: 'error', message: 'Retry this message.' }]),
			() => {},
		),
	).rejects.toThrow('Retry this message.');
	await expect(
		readMathStream(
			new Response('{"message":"Connect a provider"}', { status: 503 }),
			() => {},
		),
	).rejects.toThrow('Connect a provider');
});
it('cancels the reader after receiving completion', async () => {
	let cancelled = false;
	const result = new Response(
		new ReadableStream({
			start(c) {
				c.enqueue(
					new TextEncoder().encode(
						JSON.stringify({ type: 'complete', session }) + '\n',
					),
				);
			},
			cancel() {
				cancelled = true;
			},
		}),
	);
	await readMathStream(result, () => {});
	expect(cancelled).toBe(true);
});
