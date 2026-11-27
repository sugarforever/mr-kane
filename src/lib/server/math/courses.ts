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
				'List AoPS learning domains or retrieve a domain’s recommended chapter route with exact section locators. The current adapter defaults to one selected chapter per lesson; proof and extension chapters are optional supporting branches, not a strict dependency chain.',
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
				'Load planning to create/revise plans, synchronize history or adopt updated rules in an unfinished lesson; teaching to start/resume instruction or repair gaps; assessment to decide completion, readiness, remediation, waiver or pause.',
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
Use course_skill to select planning, teaching or assessment. Reload teaching for each new teaching request, including continue: historical tool results may be outdated. Load assessment before deciding completion. Standalone questions need no enrollment.
The original conversation owns saved plans and learner facts. Bound lesson conversations own their transcript and may update only their bound lesson. learner contains the latest saved plan and background. Use get_learning_checkpoint when resuming interrupted work or after a save conflict, and reconcile with its latest learner. Call save_learning_checkpoint using incremental updates immediately after creating or revising a plan and after recording progress, even before lesson completion. For updates, send only changed fields using updates.plans with stable id/courseId; omitted lessons and attempts are retained. Never regenerate saved evidence to copy it into tool arguments. Do not claim a plan is saved until the tool succeeds. Plans mentioned only in historical messages must be explicitly reconciled using planning and saved; never invent missing evidence. Preserve plan/objective IDs and exact student-answer excerpts. Keep missing historical evidence unverified.
LESSON COMPLETION
Reply directly in Markdown. After course_skill assessment establishes a completed lesson, call complete_lesson with its planId and courseId. An accepted request is pending background validation, not a saved profile. A lesson already completed in learner needs no call. For a failed profileUpdate, reassess that lesson and call again when the criteria hold. Planning, hints, partial assessments, pauses and waivers alone do not complete a lesson. Explain relevant progress without repeating whole records.`;
