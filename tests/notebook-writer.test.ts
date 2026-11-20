import { expect, it } from 'vitest';
import { createNotebookWriter } from '../src/lib/client/notebook-writer';
import { emptyLearningRecords } from '../src/lib/learning-records';
it('keeps both concurrent review edits visible and persists a later undo', async () => {
	const server = emptyLearningRecords();
	let current = emptyLearningRecords().notebook;
	const write = createNotebookWriter(
		() => current,
		(n) => {
			current = n;
		},
		async (command) => {
			await new Promise<void>((r) => setTimeout(r, 1));
			if (command.type === 'review.put')
				server.notebook.reviews[command.key] = command.reviewed;
			return structuredClone(server);
		},
	);
	await Promise.all([
		write({ ...current, reviews: { first: true } }),
		write({ ...current, reviews: { second: true } }),
	]);
	expect(current.reviews).toEqual({ first: true, second: true });
	await write({ ...current, reviews: { ...current.reviews, first: false } });
	expect(server.notebook.reviews).toEqual({ first: false, second: true });
});
