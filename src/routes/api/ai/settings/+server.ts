import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readInput } from '#lib/server/http';
import {
	publicSettings,
	saveConnection,
	selectConnection,
	removeConnection,
} from '#lib/server/providers-store';
import {
	catalog,
	connectionInput,
	normalize,
	discover,
} from '#lib/server/providers-models';
import { cancelLogin } from '#lib/server/provider-auth';
const headers = { 'cache-control': 'no-store' };
export function GET({ request, url }) {
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== url.origin)
	)
		error(403, 'Open settings from the app.');
	return json({ ...publicSettings(), catalog: catalog() }, { headers });
}
export async function POST({ request, url }) {
	const body = await readInput(request, url);
	let connectionId: string | undefined;
	try {
		if (body.action === 'select') {
			const v = z
				.object({
					id: z.string().max(100).nullable(),
					modelId: z.string().max(200).optional(),
				})
				.parse(body);
			selectConnection(v.id, v.modelId);
		} else if (body.action === 'remove') {
			const id = z.string().max(100).parse(body.id);
			cancelLogin(id);
			removeConnection(id);
		} else if (body.action === 'save') {
			const input = normalize(connectionInput.parse(body.connection));
			const models = await discover(input);
			const modelId = input.modelId || models[0];
			if (!models.includes(modelId))
				throw new Error('Choose one of the available models.');
			if (input.id) cancelLogin(input.id);
			connectionId = saveConnection(
				{ ...input, modelId, models },
				input.apiKey?.trim(),
			).id;
		} else throw new Error('Unknown settings action.');
		return json(
			{ ...publicSettings(), catalog: catalog(), connectionId },
			{ headers },
		);
	} catch (e) {
		error(
			400,
			e instanceof z.ZodError
				? 'Check the connection fields.'
				: e instanceof Error
					? e.message
					: 'Could not save settings.',
		);
	}
}
