import { irmoBrowse } from '$lib/server/math/irmo';
import { configured } from '$lib/server/agent';
import { publicSettings } from '$lib/server/providers-store';
import {
	getMathSession,
	listMathSessions,
	MathStudyError,
} from '$lib/server/math/study';
import { error } from '@sveltejs/kit';
export async function load({ url }) {
	const sessions = await listMathSessions();
	const id = url.searchParams.get('session') || sessions[0]?.id;
	try {
		return {
			sessions,
			irmo: await irmoBrowse(),
			session: id ? await getMathSession(id) : null,
			aiConfigured: configured(),
			aiSettings: publicSettings(),
		};
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		throw e;
	}
}
