import { describe, expect, it } from 'vitest';
import {
	requestSchema,
	parseFeedback,
	parsePractice,
	addAttempt,
	restoreNotebook,
} from '../src/lib/domain';
const profile = {
	language: 'es',
	level: 'A2',
	ageGroup: 'Middle school',
	interests: '足球',
	vocabulary: 'viajar',
	grammar: '过去时',
};
const practice = {
	id: 'p1',
	title: '周末',
	prompt: '描述周末',
	script: 'El sábado fui al parque.',
	vocabulary: ['parque'],
	focus: '过去时',
	sourceNote: '日常观察',
	mode: 'writing',
	origin: 'demo',
	createdAt: '2026-11-16',
	profile,
};
describe('learning contracts', () => {
	it('rejects unsupported languages and oversized supplied material', () => {
		expect(
			requestSchema.safeParse({
				profile: { ...profile, language: 'en' },
				mode: 'writing',
				sourceType: 'daily',
				material: '',
			}).success,
		).toBe(false);
		expect(
			requestSchema.safeParse({
				profile,
				mode: 'writing',
				sourceType: 'news',
				material: 'x'.repeat(12001),
			}).success,
		).toBe(false);
	});
	it('accepts optional source text for news and exam based practice', () => {
		expect(
			requestSchema.safeParse({
				profile,
				mode: 'speaking',
				sourceType: 'news',
				material: '',
			}).success,
		).toBe(true);
		expect(
			requestSchema.safeParse({
				profile,
				mode: 'writing',
				sourceType: 'exam',
				material: '过去时考点与旅行主题',
			}).success,
		).toBe(true);
	});
	it('rejects model feedback that quotes words absent from the submission', () => {
		expect(() =>
			parseFeedback(
				JSON.stringify({
					encouragement: '继续练习',
					points: [
						{
							quote: 'Yo soy ir',
							category: '语法',
							explanation: '时态',
							hint: '想想过去时',
							suggestion: 'Yo fui',
						},
					],
				}),
				'Fui al parque.',
			),
		).toThrow();
	});
	it('accepts fenced structured output but never a missing speaking script', () => {
		expect(
			parsePractice(
				'```json\n' +
					JSON.stringify({
						title: '周末',
						prompt: '介绍周末',
						script: 'Fui al parque.',
						vocabulary: ['parque'],
						focus: '过去时',
						sourceNote: '日常',
					}) +
					'\n```',
			).script,
		).toBe('Fui al parque.');
		expect(() => parsePractice('{"title":"题目"}')).toThrow();
	});
	it('retains independent submission versions and rejects a foreign language attempt', () => {
		const first = addAttempt([], {
			id: 'a1',
			practice,
			text: 'Fui al parque.',
			feedback: null,
			createdAt: '2026-11-16',
		} as any);
		const next = addAttempt(first, {
			id: 'a2',
			practice,
			text: 'Fui al parque con Ana.',
			feedback: null,
			createdAt: '2026-11-17',
		} as any);
		expect(next).toHaveLength(2);
		expect(next[1].text).toBe('Fui al parque.');
		expect(() =>
			addAttempt(next, {
				id: 'a3',
				practice: { ...practice, profile: { ...profile, language: 'xx' } },
				text: 'x',
				feedback: null,
				createdAt: '2026-11-17',
			} as any),
		).toThrow();
	});
	it('rejects corrupted history without silently discarding it', () => {
		expect(() => restoreNotebook('{broken')).toThrow();
		expect(() => restoreNotebook('{"version":1,"attempts":[{}]}')).toThrow();
		expect(restoreNotebook(null)).toEqual({
			version: 1,
			attempts: [],
			practices: [],
			reviews: {},
		});
	});
});
