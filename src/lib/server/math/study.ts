import { createStudy } from '../learning/study';
import { mathAgent } from './agent';
import { validateCourseUpdate } from './course-validation';
import { emptyLearner, mathAnswerSchema } from '$lib/math';
export { StudyError as MathStudyError } from '../learning/study';
const study = createStudy({
	namespace: 'math',
	title: 'New math conversation',
	operation: 'math-chat',
	agent: mathAgent,
	emptyLearner,
	answerSchema: mathAnswerSchema,
	validateLearner: validateCourseUpdate,
});
export const createMathSession = study.createSession;
export const listMathSessions = study.listSessions;
export const getMathSession = study.getSession;
export const runMathTurn = study.runTurn;
export const discardMathTurn = study.discardTurn;

export const hasMathRequest = study.hasRequest;
