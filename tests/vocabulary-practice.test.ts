import { beforeEach, expect, it, vi } from 'vitest';
import { defaultProfile, requestSchema } from '../src/lib/domain';
vi.mock('../src/lib/server/agent', () => ({
	configured: vi.fn(() => true),
	hasCoachRequest: vi.fn(() => false),
	coachSources: vi.fn(() => ({ sources: [] })),
	runCoach: vi.fn(),
}));
import { POST } from '../src/routes/api/practice/+server';
import { configured, runCoach } from '../src/lib/server/agent';
const url = new URL('http://localhost/api/practice');
const input = {
	profile: defaultProfile,
	mode: 'writing',
	sourceType: 'daily',
	material: '',
	research: false,
	selectedVocabulary: ['páirc', 'crann'],
};
const request = (body: unknown) => ({
	url,
	request: new Request(url, {
		method: 'POST',
		headers: {
			origin: url.origin,
			'Content-Type': 'application/json',
			'x-request-id': 'vocabulary-test',
		},
		body: JSON.stringify(body),
	}),
});
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(configured).mockReturnValue(true);
});
it('bounds selected vocabulary without breaking older practice requests', () => {
	expect(requestSchema.safeParse(input).success).toBe(true);
	expect(
		requestSchema.safeParse({ ...input, selectedVocabulary: undefined })
			.success,
	).toBe(true);
	for (const words of [
		[],
		Array(13).fill('word'),
		[' '],
		['x'.repeat(201)],
		Array(6).fill('x'.repeat(200)),
	])
		expect(
			requestSchema.safeParse({ ...input, selectedVocabulary: words }).success,
		).toBe(false);
});
it('requires AI instead of returning an unrelated fixed sample', async () => {
	vi.mocked(configured).mockReturnValue(false);
	await expect(POST(request(input) as any)).rejects.toMatchObject({
		status: 503,
	});
	expect(runCoach).not.toHaveBeenCalled();
});
it.each(['writing', 'speaking'])(
	'persists selected vocabulary and routes %s practice through the runtime',
	async (mode) => {
		vi.mocked(runCoach).mockResolvedValue(
			JSON.stringify({
				title: 'A walk',
				prompt: 'Describe a walk using these words.',
				script: 'Tá crann sa pháirc.',
				vocabulary: ['páirc · park', 'crann · tree'],
				focus: 'Places',
				sourceNote: 'Original vocabulary practice.',
			}),
		);
		const response = await POST(request({ ...input, mode }) as any);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			mode,
			origin: 'pi',
			targetVocabulary: ['páirc', 'crann'],
		});
		expect(runCoach).toHaveBeenCalledWith(
			'practice',
			{ ...input, mode },
			expect.any(Object),
			'vocabulary-test',
		);
	},
);

it('persists a reading unit and rejects model output that does not match it', async () => {
	const content = {
		title: 'Words',
		prompt: 'Listen and repeat.',
		script: 'páirc\n\ncrann',
		vocabulary: ['páirc · park', 'crann · tree'],
		focus: 'Words',
		sourceNote: 'Original vocabulary practice.',
	};
	vi.mocked(runCoach).mockResolvedValue(JSON.stringify(content));
	const response = await POST(
		request({ ...input, mode: 'speaking', readingUnit: 'words' }) as any,
	);
	expect(await response.json()).toMatchObject({
		readingUnit: 'words',
		script: content.script,
	});
	expect(runCoach).toHaveBeenCalledWith(
		'practice',
		expect.objectContaining({ readingUnit: 'words' }),
		expect.any(Object),
		'vocabulary-test',
	);
	vi.mocked(runCoach).mockResolvedValue(
		JSON.stringify({ ...content, script: 'word '.repeat(100) }),
	);
	await expect(
		POST(request({ ...input, mode: 'speaking', readingUnit: 'words' }) as any),
	).rejects.toMatchObject({ status: 502 });
});
