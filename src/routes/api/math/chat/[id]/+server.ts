import { json, error } from '@sveltejs/kit';
import { readInput } from '$lib/server/http';
import { mathTurnSchema } from '$lib/math';
import { runCoach, configured, hasCoachRequest } from '$lib/server/agent';
import type { MathStreamEvent } from '$lib/math-stream';
import { runMathTurn, MathStudyError } from '$lib/server/math/study';
export async function POST({ request, url, params }) {
	const input = mathTurnSchema.safeParse(await readInput(request, url));
	if (!input.success) error(400, input.error.issues[0].message);
	if (!configured() && !hasCoachRequest(`math-${input.data.requestId}`))
		error(503, 'Connect an AI provider to study Math.');
	if (request.headers.get('accept')?.includes('application/x-ndjson')) {
		let closed = false;
		let heartbeat: ReturnType<typeof setInterval> | undefined;
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				const send = (event: MathStreamEvent) => {
					if (closed) return;
					// Progress is a snapshot: a slow reader only needs the next one.
					if (event.type === 'progress' && (controller.desiredSize ?? 0) <= 0)
						return;
					controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
				};
				send({ type: 'progress', reply: '', status: 'thinking' });
				heartbeat = setInterval(() => {
					if (!closed && (controller.desiredSize ?? 0) > 0)
						controller.enqueue(encoder.encode('\n'));
				}, 15000);
				heartbeat.unref();
				// Disconnecting stops delivery, not the durable turn or its final save.
				void runMathTurn(
					params.id,
					input.data.requestId,
					input.data.message,
					runCoach,
					send,
				)
					.then((session) => send({ type: 'complete', session }))
					.catch((e) =>
						send({
							type: 'error',
							message:
								e instanceof MathStudyError
									? e.message
									: 'The Math coach could not finish. Retry this message to continue the same conversation.',
						}),
					)
					.finally(() => {
						clearInterval(heartbeat);
						if (!closed) {
							closed = true;
							controller.close();
						}
					});
			},
			cancel() {
				closed = true;
				clearInterval(heartbeat);
			},
		});
		return new Response(body, {
			headers: {
				'Content-Type': 'application/x-ndjson; charset=utf-8',
				'Cache-Control': 'no-store, no-transform',
				'X-Accel-Buffering': 'no',
			},
		});
	}
	try {
		return json(
			await runMathTurn(params.id, input.data.requestId, input.data.message),
			{ headers: { 'Cache-Control': 'no-store' } },
		);
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		error(
			502,
			'The Math coach could not finish. Retry this message to continue the same conversation.',
		);
	}
}
