import type { StudyProgress, StudyStreamEvent } from '$lib/study-stream';

/** Delivery may be cancelled; the operation must still finish its durable save. */
export function studyResponse<Session>(
	run: (progress: (event: StudyProgress) => void) => Promise<Session>,
	errorMessage: (error: unknown) => string,
): Response {
	let closed = false;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (event: StudyStreamEvent<Session>) => {
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
			void Promise.resolve()
				.then(() => run(send))
				.then((session) => send({ type: 'complete', session }))
				.catch((e) => send({ type: 'error', message: errorMessage(e) }))
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
