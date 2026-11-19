import { expect, it, vi, beforeEach } from 'vitest';
import {
	matchingVoice,
	translationInput,
	readingSelection,
} from '../src/lib/reading';
vi.mock('../src/lib/server/language-agent', () => ({
	configured: vi.fn(() => true),
	hasCoachRequest: vi.fn(() => false),
	runCoach: vi.fn(async () => '{"english":"Good morning"}'),
}));
import { POST } from '../src/routes/api/translate/+server';
import { configured, runCoach } from '../src/lib/server/language-agent';
beforeEach(() => vi.clearAllMocks());
const url = new URL('http://localhost/api/translate');
const request = (body: unknown, origin = url.origin) => ({
	url,
	request: new Request(url, {
		method: 'POST',
		headers: { origin, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	}),
});
it('requires a matching local language voice, never English for Irish or network voices', () => {
	const voices = [
		{ lang: 'en-IE', localService: true },
		{ lang: 'ga-IE', localService: false },
		{ lang: 'es_ES', localService: true },
	];
	expect(matchingVoice(voices, 'ga')).toBeUndefined();
	expect(matchingVoice(voices, 'es')).toBe(voices[2]);
	expect(
		matchingVoice([...voices, { lang: 'ga-IE', localService: true }], 'ga')
			?.lang,
	).toBe('ga-IE');
});
it('bounds selections and accepts only necessary text and language fields', () => {
	for (const text of ['', '   ', 'x'.repeat(4001)])
		expect(translationInput.safeParse({ text, language: 'ga' }).success).toBe(
			false,
		);
	expect(
		translationInput.safeParse({ text: 'Hola', language: 'en' }).success,
	).toBe(false);
	expect(
		translationInput.safeParse({ text: 'Hola', language: 'es', profile: {} })
			.success,
	).toBe(false);
});
it('ignores collapsed or cross-script selections', () => {
	const node = {};
	const element = { contains: (n: unknown) => n === node } as HTMLElement;
	const selection = {
		isCollapsed: false,
		rangeCount: 1,
		getRangeAt: () => ({ startContainer: node, endContainer: {} }),
		toString: () => 'Hello',
	} as unknown as Selection;
	expect(readingSelection(selection, element)).toBe('');
	expect(readingSelection(null, element)).toBe('');
});
it('translates through the configured runtime with no profile or full script', async () => {
	const response = await POST(
		request({ language: 'ga', text: 'Maidin mhaith' }) as any,
	);
	expect(await response.json()).toEqual({ english: 'Good morning' });
	expect(runCoach).toHaveBeenCalledWith(
		'translate',
		{ language: 'ga', text: 'Maidin mhaith' },
		expect.any(Object),
		undefined,
	);
});
it('rejects foreign origins and oversized text before calling the model', async () => {
	await expect(
		POST(
			request(
				{ language: 'ga', text: 'Dia duit' },
				'https://elsewhere.example',
			) as any,
		),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		POST(request({ language: 'es', text: 'x'.repeat(4001) }) as any),
	).rejects.toMatchObject({ status: 400 });
	expect(runCoach).not.toHaveBeenCalled();
});
it('reports unavailable providers and malformed model results safely', async () => {
	vi.mocked(configured).mockReturnValueOnce(false);
	await expect(
		POST(request({ language: 'es', text: 'Hola' }) as any),
	).rejects.toMatchObject({ status: 503 });
	vi.mocked(runCoach).mockResolvedValueOnce('{"english":""}');
	await expect(
		POST(request({ language: 'es', text: 'Hola' }) as any),
	).rejects.toMatchObject({ status: 502 });
});
