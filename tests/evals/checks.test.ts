import { expect, it } from 'vitest';
import { checkOutcome } from '../../scripts/evals/checks.mjs';
const expected = { completion: false, profileChanged: false };
it('does not pass an ordinary turn if it emitted a completion or changed the profile', () => {
	for (const observation of [
		{ completion: { planId: 'p', courseId: 'V1-C05' }, profileChanged: false },
		{ completion: null, profileChanged: true },
	])
		expect(
			checkOutcome(expected, { ...observation, turnSaved: true }).some(
				(c) => !c.pass,
			),
		).toBe(true);
});
it('requires the requested lesson, persisted profile and continued chat for a completion', () => {
	const target = {
		completion: true,
		profileChanged: true,
		planId: 'p',
		courseId: 'V1-C05',
	};
	const result = {
		completion: { planId: 'p', courseId: 'V1-C05' },
		profileChanged: true,
		turnSaved: true,
		completed: true,
		continuedChat: true,
	};
	expect(checkOutcome(target, result).every((c) => c.pass)).toBe(true);
	expect(
		checkOutcome(target, { ...result, completed: false }).every((c) => c.pass),
	).toBe(false);
	expect(
		checkOutcome(target, {
			...result,
			completion: { planId: 'wrong', courseId: 'V1-C05' },
		}).every((c) => c.pass),
	).toBe(false);
});
