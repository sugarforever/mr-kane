import { parseStreamingJson } from '@earendil-works/pi-ai';
import type { StudyProgress } from './study-stream';

export function studyProgress(text: string, reading = false): StudyProgress {
	const partial = parseStreamingJson<{ reply?: unknown }>(
		text.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''),
	);
	const reply =
		typeof partial?.reply === 'string' ? partial.reply.slice(0, 20000) : '';
	return {
		type: 'progress',
		reply,
		status: reading
			? 'reading'
			: /^\s*(?:```(?:json)?\s*)?\{\s*"reply"\s*:\s*"(?:[^"\\]|\\.)*"/.test(
						text,
				  )
				? 'finishing'
				: reply
					? 'writing'
					: 'thinking',
	};
}
