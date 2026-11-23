import { expect, it } from 'vitest';
import { studyProgress } from '../src/lib/study-progress';
it('distinguishes a completed reply from an unfinished escaped string', () => {
	expect(studyProgress('{"reply":"Try \\"x\\"').status).toBe('writing');
	expect(studyProgress('{"reply":"Try \\"x\\"", "learner":{').status).toBe(
		'finishing',
	);
	expect(studyProgress('{"reply":"Try \\"x\\"", "learner":{').reply).toBe(
		'Try "x"',
	);
});
it('does not mistake reply text containing a field name for a completed reply', () => {
	expect(studyProgress('{"reply":"A \\"reply\\": \\"yes\\"').status).toBe(
		'writing',
	);
});
