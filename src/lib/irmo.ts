export type IrmoQuestion = {
	id: string;
	year: number;
	stage: 'predecessor-final' | 'round-2';
	paper: number;
	number: number;
	date: string;
	title: string;
	topics: string[];
	aops: { chapterId: string; section?: string; title: string }[];
	path: string;
	scan: string;
	pdfPage: number;
	printedPage: number;
	hasDiagram: boolean;
	keywords: string;
};
export type IrmoCatalog = {
	name: string;
	years: number[];
	coverage: string;
	source: { title: string; author: string; url: string; archive: string };
	topics: string[];
	questions: IrmoQuestion[];
};
export type IrmoPassage = IrmoQuestion & {
	content: string;
	source: string;
	scanUrl: string;
	attribution: string;
};
export type IrmoBrowse = Pick<
	IrmoCatalog,
	'years' | 'topics' | 'coverage' | 'source'
> & {
	questions: Pick<
		IrmoQuestion,
		| 'id'
		| 'year'
		| 'stage'
		| 'paper'
		| 'number'
		| 'title'
		| 'topics'
		| 'hasDiagram'
		| 'keywords'
	>[];
};
