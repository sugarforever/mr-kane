import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { readInput } from '#lib/server/http';
import {
	authStatus,
	startLogin,
	answerLogin,
	cancelLogin,
	disconnect,
} from '#lib/server/provider-auth';
const headers = { 'cache-control': 'no-store' };
export function GET({ request, url }) {
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== url.origin)
	)
		error(403, 'Open sign-in from the app.');
	try {
		return json(
			authStatus(z.string().min(1).max(100).parse(url.searchParams.get('id'))),
			{ headers },
		);
	} catch {
		error(400, 'Select an account-login connection.');
	}
}
export async function POST({ request, url }) {
	const b = await readInput(request, url);
	try {
		const id = z.string().min(1).max(100).parse(b.id);
		switch (b.action) {
			case 'start':
				return json(
					startLogin(
						id,
						z.enum(['browser', 'device_code']).parse(b.method ?? 'browser'),
					),
					{ headers },
				);
			case 'answer':
				return json(
					answerLogin(
						id,
						z.string().parse(b.flowId),
						z.string().parse(b.promptId),
						z.string().max(16384).parse(b.value),
					),
					{ headers },
				);
			case 'cancel':
				cancelLogin(id);
				return json(authStatus(id), { headers });
			case 'disconnect':
				return json(await disconnect(id), { headers });
			default:
				error(400, 'Unknown sign-in action.');
		}
	} catch {
		error(
			400,
			'Could not complete this sign-in step. Refresh the connection and try again.',
		);
	}
}
