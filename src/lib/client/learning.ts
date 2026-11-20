import {
	learningRecordsSchema,
	type LearningCommand,
	type LearningRecords,
} from '../learning-records';
export async function readLearningRecords(): Promise<LearningRecords> {
	const response = await fetch('/api/learning', { cache: 'no-store' });
	if (!response.ok)
		throw new Error('Learning records could not be loaded. Please retry.');
	return learningRecordsSchema.parse(await response.json());
}
export async function updateLearning(
	command: LearningCommand,
): Promise<LearningRecords> {
	const response = await fetch('/api/learning', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(command.type === 'legacy.import' ? { 'x-learning-import': '1' } : {}),
		},
		body: JSON.stringify(command),
	});
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.message ?? 'Learning records could not be saved.');
	return learningRecordsSchema.parse(result);
}
