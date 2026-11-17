import {
	speechSettingsSchema,
	speechModel,
	type PublicSpeechSettings,
	type SpeechLanguage,
} from '$lib/speech';
import { speechCheckSchema } from './speech-recognition';
export async function fetchSpeechSettings(
	signal?: AbortSignal,
): Promise<PublicSpeechSettings> {
	const response = await fetch('/api/speech/settings', {
		cache: 'no-store',
		signal,
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(value.message || 'Speech settings could not be loaded.');
	return { ...value, settings: speechSettingsSchema.parse(value.settings) };
}
export function encodeWav(
	samples: Float32Array,
	sampleRate = 16000,
): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const write = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i++)
			view.setUint8(offset + i, value.charCodeAt(i));
	};
	write(0, 'RIFF');
	view.setUint32(4, buffer.byteLength - 8, true);
	write(8, 'WAVE');
	write(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	write(36, 'data');
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
	}
	return buffer;
}
export async function wavRecording(
	blob: Blob,
	signal?: AbortSignal,
): Promise<Blob> {
	if (blob.type.split(';')[0].includes('wav')) return blob;
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(await blob.arrayBuffer());
		signal?.throwIfAborted();
		if (decoded.duration > 305)
			throw new Error('Use a recording of up to 5 minutes.');
		const offline = new OfflineAudioContext(
			1,
			Math.max(1, Math.ceil(decoded.duration * 16000)),
			16000,
		);
		const source = offline.createBufferSource();
		source.buffer = decoded;
		source.connect(offline.destination);
		source.start();
		const rendered = await offline.startRendering();
		signal?.throwIfAborted();
		return new Blob([encodeWav(rendered.getChannelData(0))], {
			type: 'audio/wav',
		});
	} finally {
		await context.close();
	}
}
export async function transcribeSpeech(
	blob: Blob,
	language: SpeechLanguage,
	signal?: AbortSignal,
) {
	const { settings } = await fetchSpeechSettings(signal);
	const choice = settings.stt;
	if (
		!speechModel('stt', choice.provider, choice.model).languages.includes(
			language,
		)
	)
		throw new Error(
			'The selected speech recognition model does not support Irish. Change it in Speech settings.',
		);
	const audio =
		speechModel('stt', choice.provider, choice.model).inputFormat === 'wav'
			? await wavRecording(blob, signal)
			: blob;
	const response = await fetch('/api/transcribe', {
		method: 'POST',
		headers: {
			'Content-Type': audio.type || 'audio/webm',
			'x-reading-language': language,
		},
		body: audio,
		signal,
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			value.message || 'Speech recognition failed. Please retry.',
		);
	return speechCheckSchema.parse(value);
}
