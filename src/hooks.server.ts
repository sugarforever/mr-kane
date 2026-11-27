import { building } from '$app/env';
import type { ServerInit } from '@sveltejs/kit/hooks';
import { resumeMathProfileUpdates } from '$lib/server/math/study';

// Pending completion jobs are durable; restarting the server resumes them.
export const init: ServerInit = async () => {
	if (!building) await resumeMathProfileUpdates();
};
