import { expect, it } from 'vitest';
import { learnerSchema } from '../src/lib/math';
const legacy = {
	background: 'Grade 10',
	goal: 'Number theory',
	weeklyTime: '3 hours',
	reportedKnowledge: ['Linear equations'],
	strengths: ['Explains parity'],
	gaps: ['Congruences'],
	observations: ['Used a parity argument independently'],
};
it('accepts old records without inventing a summary or losing evidence', () => {
	expect(learnerSchema.parse(legacy)).toEqual(legacy);
});
it('retains a concise summary separately from the complete learner facts', () => {
	const summary = {
		goal: 'Prepare for IrMO',
		currentLevel: 'Can explain parity arguments',
		nextStep: 'Try one congruence problem',
	};
	expect(learnerSchema.parse({ ...legacy, summary })).toEqual({
		...legacy,
		summary,
	});
});
it('rejects summaries that would turn the compact panel into a full record', () => {
	expect(
		learnerSchema.safeParse({
			...legacy,
			summary: { goal: 'x'.repeat(181), currentLevel: '', nextStep: '' },
		}).success,
	).toBe(false);
});
