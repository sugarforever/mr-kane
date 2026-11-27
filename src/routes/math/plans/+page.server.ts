import { mathPlanWorkspace } from '$lib/server/math/study';
export async function load({ setHeaders }) {
	setHeaders({ 'Cache-Control': 'no-store' });
	try {
		return { ...(await mathPlanWorkspace()), failure: '' };
	} catch {
		return {
			plans: [],
			planningSessionId: null,
			failure: 'Your learning plans could not be loaded. Please retry.',
		};
	}
}
