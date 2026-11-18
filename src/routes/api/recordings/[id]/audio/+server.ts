import { error } from '@sveltejs/kit';
import { getRecording } from '$lib/server/recordings';
import {
	recordingAccess,
	privateRecordingHeaders,
} from '$lib/server/recording-http';
export function GET({ request, url, params }) {
	recordingAccess(request, url);
	const row = getRecording(params.id);
	if (!row) error(404, 'Recording not found.');
	const total = row.audio.length;
	const headers = {
		...privateRecordingHeaders,
		'Content-Type': row.mime,
		'Accept-Ranges': 'bytes',
	};
	const range = request.headers.get('range');
	if (range) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (!match || (!match[1] && !match[2]))
			return new Response(null, {
				status: 416,
				headers: { ...headers, 'Content-Range': `bytes */${total}` },
			});
		const start = match[1]
			? Number(match[1])
			: Math.max(0, total - Number(match[2]));
		const end = match[1]
			? match[2]
				? Math.min(total - 1, Number(match[2]))
				: total - 1
			: total - 1;
		if (
			!Number.isSafeInteger(start) ||
			!Number.isSafeInteger(end) ||
			start > end ||
			start >= total
		)
			return new Response(null, {
				status: 416,
				headers: { ...headers, 'Content-Range': `bytes */${total}` },
			});
		return new Response(new Uint8Array(row.audio.slice(start, end + 1)), {
			status: 206,
			headers: {
				...headers,
				'Content-Range': `bytes ${start}-${end}/${total}`,
				'Content-Length': String(end - start + 1),
			},
		});
	}
	return new Response(new Uint8Array(row.audio), {
		headers: { ...headers, 'Content-Length': String(total) },
	});
}
