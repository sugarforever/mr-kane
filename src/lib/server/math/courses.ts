import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineTool } from '@earendil-works/pi-durable';
import { z } from 'zod';
import { courseCatalog } from '../../math-courses';
import { mathCatalog } from './aops';

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
				'Load course-management instructions. Use planning for a new/revised domain plan or synchronizing old conversation progress; teaching to start/resume lessons and update attempts; assessment for evidence-based completion and reports. Save results in learner.coursePlans via outputSchema.',
			parameters: z.toJSONSchema(skillInput),
			async execute(raw) {
				const { skill } = skillInput.parse(raw);
				return result({
					skill,
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
Use course_skill for chapter-based domain plans and saved lessons, including progress synchronization from this conversation; its tool description identifies the appropriate skill. Standalone questions need no enrollment.
Return the complete learner.coursePlans through outputSchema, preserving other plans and recorded evidence. The application commits learner and reply together and displays plans and reports. New evidence must quote actual student messages exactly; missing historical evidence stays unverified.`;
