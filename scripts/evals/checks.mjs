/**
 * Pure outcome checks shared by live evals and ordinary regression tests.
 * @param {{completion: boolean, profileChanged: boolean, planId?: string, courseId?: string}} expected
 * @param {{completion: {planId: string, courseId: string} | null, profileChanged: boolean, turnSaved: boolean, completed?: boolean, continuedChat?: boolean | null, profileStatus?: string | null}} observed
 */
export function checkOutcome(expected, observed) {
	/** @type {[string, boolean][]} */
	const checks = [
		[
			'completion signal',
			(observed.completion !== null) === expected.completion,
		],
		[
			'profile persistence',
			observed.profileChanged === expected.profileChanged,
		],
		['chat turn saved', observed.turnSaved === true],
	];
	if (expected.completion) {
		checks.push([
			'correct lesson',
			observed.completion?.planId === expected.planId &&
				observed.completion?.courseId === expected.courseId,
		]);
		checks.push(['validated completion', observed.completed === true]);
		checks.push(['continued chat', observed.continuedChat === true]);
	}
	checks.push([
		'background settled',
		observed.profileStatus !== 'pending' && observed.profileStatus !== 'failed',
	]);
	return checks.map(([name, pass]) => ({ name, pass }));
}
