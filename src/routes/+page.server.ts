import { configured } from '#lib/server/agent';
import { publicSettings } from '#lib/server/providers-store';
export function load() {
	return { aiConfigured: configured(), aiSettings: publicSettings() };
}
