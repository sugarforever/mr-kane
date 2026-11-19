import { miniMaxBaseUrl, type MiniMaxRegion } from '$lib/speech';
import { z } from 'zod';
import { providerFetch, providerJSON } from './contracts';
const voice = z.object({
	voice_id: z.string().min(1).max(100),
	voice_name: z.string().optional(),
});
const catalog = z.object({
	system_voice: z.array(voice).nullish(),
	voice_cloning: z.array(voice).nullish(),
	voice_generation: z.array(voice).nullish(),
	base_resp: z.object({ status_code: z.number() }),
});
export async function miniMaxVoices(
	key: string,
	region: MiniMaxRegion = 'international',
) {
	const response = await providerFetch(
		'MiniMax',
		miniMaxBaseUrl(region) + '/get_voice',
		key,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ voice_type: 'all' }),
		},
		AbortSignal.timeout(15000),
	);
	const value = catalog.parse(await providerJSON(response, 2 * 1024 * 1024));
	if (value.base_resp.status_code !== 0)
		throw new Error(
			'Could not load MiniMax voices. Check your API key and audio access.',
		);
	const voices = [
		...(value.system_voice ?? []),
		...(value.voice_cloning ?? []),
		...(value.voice_generation ?? []),
	];
	return Array.from(
		new Map(
			voices.map((v) => [
				v.voice_id,
				{ id: v.voice_id, label: v.voice_name || v.voice_id },
			]),
		).values(),
	);
}
