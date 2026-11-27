import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineTool } from '@earendil-works/pi-durable';
import { z } from 'zod';
import { courseCatalog } from '../../math-courses';
import { mathCatalog } from './aops';
export const completionCriteriaPath = resolve(
	'skills/aops-course-assessment/references/completion.md',
);

const skills = {
	planning: 'aops-course-planning',
	teaching: 'aops-course-teaching',
	assessment: 'aops-course-assessment',
} as const;
export function createCourseTools() {
	const result = (value: unknown) => ({
		output: [{ type: 'text' as const, text: JSON.stringify(value) }],
	});
	const catalogInput = z
		.object({
			domain: z
				.enum([
					'number-theory',
					'algebra',
					'geometry',
					'counting-probability',
					'proof',
					'mixed',
				])
				.optional(),
		})
		.strict();
	const skillInput = z
		.object({ skill: z.enum(['planning', 'teaching', 'assessment']) })
		.strict();
	return [
		defineTool({
			name: 'course_catalog',
			description:
				'List AoPS learning domains or retrieve a domain’s recommended chapter route with exact section locators. One chapter is one lesson; proof and extension chapters are optional supporting branches, not a strict dependency chain.',
			parameters: z.toJSONSchema(catalogInput),
			async execute(raw) {
				const { domain } = catalogInput.parse(raw);
				if (!domain)
					return result(courseCatalog.map(({ id, title }) => ({ id, title })));
				const route = courseCatalog.find((r) => r.id === domain)!;
				const chapters = await mathCatalog();
				return result({
					...route,
					chapters: route.chapters.map((id) => {
						const c = chapters.find((c) => c.id === id)!;
						return {
							courseId: c.id,
							title: c.title,
							volume: c.volume,
							sections: c.sections.map((s) => ({
								id: s.id,
								title: s.title,
								page: s.printed_page,
							})),
						};
					}),
				});
			},
		}),
		defineTool({
			name: 'course_skill',
			description:
				'Load planning to create/revise a domain plan or synchronize history; teaching to start/resume lessons and guide attempts; assessment before deciding completion, waiver, remediation or pause.',
			parameters: z.toJSONSchema(skillInput),
			async execute(raw) {
				const { skill } = skillInput.parse(raw);
				return result({
					skill,
					...(skill === 'assessment'
						? {
								completionCriteria: await readFile(
									completionCriteriaPath,
									'utf8',
								),
							}
						: {}),
					content: await readFile(
						resolve('skills', skills[skill], 'SKILL.md'),
						'utf8',
					),
				});
			},
		}),
	];
}
export const coursePrompt = `COURSE SKILLS
Use course_skill for domain planning, teaching and assessment; its description selects the branch. Standalone questions need no enrollment.
The conversation holds working plans and evidence; learner is the last saved checkpoint. Preserve plan/objective IDs and exact student-answer excerpts. Keep missing historical evidence unverified.
RESPONSE CONTRACT
Return reply as student-facing Markdown and lessonCompletion as null by default. After course_skill assessment establishes a completed chapter, return lessonCompletion: {planId, courseId}. A chapter already completed in learner needs no signal. For a failed profileUpdate, reassess that lesson and signal again when the criteria hold. All other activity, including planning, hints, partial assessments, pauses and waivers, keeps lessonCompletion null. Return only these response fields. The host consolidates the profile in the background; explain relevant progress without repeating whole records.`;
