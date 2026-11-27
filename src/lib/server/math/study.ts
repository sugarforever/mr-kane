import { createStudy } from '../learning/study';
import { mathAgent } from './agent';
import { consolidateMathProfile, lessonIsComplete } from './profile';
import { validateCourseUpdate } from './course-validation';
import {
	emptyLearner,
	mathAnswerSchema,
	lessonCompletionSchema,
} from '$lib/math';
export { StudyError as MathStudyError } from '../learning/study';
const study = createStudy({
	namespace: 'math',
	title: 'New math conversation',
	operation: 'math-chat',
	replyFormat: 'markdown',
	agent: mathAgent,
	emptyLearner,
	answerSchema: mathAnswerSchema,
	validateLearner: validateCourseUpdate,
	checkpoint: {
		completionSchema: lessonCompletionSchema,
		generate: consolidateMathProfile,
		isComplete: lessonIsComplete,
	},
});
export const createMathSession = study.createSession;
export const listMathSessions = study.listSessions;
export const getMathSession = study.getSession;
export const runMathTurn = study.runTurn;
export const discardMathTurn = study.discardTurn;

export const hasMathRequest = study.hasRequest;

export const resumeMathProfileUpdates = study.resumeProfileUpdates;
