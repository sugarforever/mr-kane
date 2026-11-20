import { notebookSchema, type Notebook } from '../domain';
import type { LearningCommand } from '../learning-records';
import { updateLearning } from './learning';
/** Capture deltas before waiting, then apply canonical server snapshots in order. */
export function createNotebookWriter(
	read: () => Notebook,
	apply: (notebook: Notebook) => void,
	send = updateLearning,
) {
	let tail = Promise.resolve();
	return (input: Notebook) => {
		const next = notebookSchema.parse(input);
		const base = read();
		const commands: LearningCommand[] = [];
		for (const practice of next.practices)
			if (
				JSON.stringify(base.practices.find((p) => p.id === practice.id)) !==
				JSON.stringify(practice)
			)
				commands.push({ type: 'practice.put', practice });
		for (const attempt of next.attempts)
			if (
				JSON.stringify(base.attempts.find((a) => a.id === attempt.id)) !==
				JSON.stringify(attempt)
			)
				commands.push({ type: 'attempt.put', attempt });
		for (const [key, reviewed] of Object.entries(next.reviews))
			if (base.reviews[key] !== reviewed)
				commands.push({ type: 'review.put', key, reviewed });
		const write = tail.then(async () => {
			for (const command of commands) apply((await send(command)).notebook);
		});
		tail = write.catch(() => {});
		return write;
	};
}
