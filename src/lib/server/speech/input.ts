import { speechModel } from '$lib/speech';
import { readSpeechSettings } from './settings';
import { SpeechError } from './contracts';
/** Tool artifacts must be normalized by their producer; no implicit server codec dependency. */
export function assertSpeechAudioFormat(mimeType: string) {
	const { provider, model } = readSpeechSettings().stt;
	if (
		speechModel('stt', provider, model).inputFormat === 'wav' &&
		!['audio/wav', 'audio/x-wav'].includes(mimeType.split(';')[0].trim())
	)
		throw new SpeechError(
			415,
			'The selected speech recognition model requires WAV audio. Convert this recording to WAV before uploading, or choose a model that accepts its format.',
		);
}
