import type { MathSession } from './math';
import { readStudyStream } from './study-stream';
export type { StudyProgress as MathProgress } from './study-stream';
export type MathStreamEvent =
	import('./study-stream').StudyStreamEvent<MathSession>;
export const readMathStream = readStudyStream<MathSession>;
