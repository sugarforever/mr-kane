export type StudyProgress = {
	type: 'progress';
	reply: string;
	status: 'thinking' | 'reading' | 'writing';
};
export type StudyStreamEvent<Session> =
	| StudyProgress
	| { type: 'complete'; session: Session }
	| { type: 'error'; message: string };

export async function readStudyStream<Session>(
	response: Response,
	onProgress: (progress: StudyProgress) => void,
): Promise<Session> {
	if (!response.ok) {
		const result = await response.json();
		throw new Error(result.message ?? 'Please try again.');
	}
	if (!response.body)
		throw new Error('The reply was interrupted. Retry this message.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pending = '';
	function accept(line: string): Session | undefined {
		if (!line.trim()) return;
		const event = JSON.parse(line) as StudyStreamEvent<Session>;
		if (event.type === 'error') throw new Error(event.message);
		if (event.type === 'complete') return event.session;
		if (event.type === 'progress') onProgress(event);
	}
	try {
		for (;;) {
			const { value, done } = await reader.read();
			pending += done
				? decoder.decode()
				: decoder.decode(value, { stream: true });
			let newline;
			while ((newline = pending.indexOf('\n')) >= 0) {
				const line = pending.slice(0, newline);
				pending = pending.slice(newline + 1);
				const session = accept(line);
				if (session) return session;
			}
			if (done) {
				const session = accept(pending);
				if (session) return session;
				throw new Error('The reply was interrupted. Retry this message.');
			}
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
