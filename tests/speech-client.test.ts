import { afterEach, expect, it, vi } from 'vitest';
import { encodeWav } from '../src/lib/client/speech-service';
import {
	createSpeechPlayback,
	remoteSpeechSegments,
} from '../src/lib/client/speech-playback';
const disposers: (() => void)[] = [];
afterEach(() => {
	disposers.splice(0).forEach((dispose) => dispose());
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
function setup() {
	const windowMock = new EventTarget();
	const documentMock = new EventTarget();
	vi.stubGlobal('window', windowMock);
	vi.stubGlobal('document', documentMock);
	const instances: any[] = [];
	vi.stubGlobal(
		'Audio',
		class {
			onended: any;
			onerror: any;
			pause = vi.fn();
			load = vi.fn();
			removeAttribute = vi.fn();
			play = vi.fn(async () => {});
			constructor(public src: string) {
				instances.push(this);
			}
		},
	);
	const value = {
		settings: {
			stt: { provider: 'openai', model: 'gpt-transcribe' },
			tts: {
				provider: 'minimax',
				model: 'speech-2.8-hd',
				voice: 'Spanish_SereneWoman',
			},
		},
		configured: { minimax: true },
	};
	const fetchMock = vi.fn(async (url: string) =>
		url === '/api/speech/settings'
			? Response.json(value)
			: new Response(new Blob(['audio'], { type: 'audio/mpeg' })),
	);
	vi.stubGlobal('fetch', fetchMock);
	return { windowMock, instances, fetchMock };
}
it('encodes mono 16kHz PCM with a correct WAV header and clamps samples', () => {
	const view = new DataView(encodeWav(new Float32Array([-2, 0, 2])));
	expect(view.byteLength).toBe(50);
	expect(view.getUint32(24, true)).toBe(16000);
	expect(view.getUint16(22, true)).toBe(1);
	expect(view.getInt16(44, true)).toBe(-32768);
	expect(view.getInt16(48, true)).toBe(32767);
	expect(
		remoteSpeechSegments('word '.repeat(2000)).every(
			(segment) => segment.length <= 3500,
		),
	).toBe(true);
});
it('plays selected remote speech and supports pause/resume/microphone cancellation', async () => {
	const { windowMock, instances } = setup();
	const changed = vi.fn();
	const available = vi.fn();
	const player = createSpeechPlayback('es', changed, available);
	disposers.push(player.dispose);
	await player.play('Hola', 0.8);
	expect(instances[0].play).toHaveBeenCalled();
	expect(changed).toHaveBeenLastCalledWith('playing');
	player.pause();
	expect(changed).toHaveBeenLastCalledWith('paused');
	player.resume();
	await Promise.resolve();
	windowMock.dispatchEvent(new Event('mr-kane-recording-start'));
	expect(instances[0].pause).toHaveBeenCalled();
	expect(changed).toHaveBeenLastCalledWith('idle');
});
it('does not play a late generation result after recording cancels the request', async () => {
	const { windowMock, instances, fetchMock } = setup();
	let resolve!: (response: Response) => void;
	const deferred = new Promise<Response>((r) => (resolve = r));
	fetchMock.mockImplementation(async (url: string) =>
		url === '/api/speech/settings'
			? Response.json({
					settings: {
						stt: { provider: 'openai', model: 'gpt-transcribe' },
						tts: {
							provider: 'minimax',
							model: 'speech-2.8-hd',
							voice: 'Spanish_SereneWoman',
						},
					},
					configured: { minimax: true },
				})
			: deferred,
	);
	const player = createSpeechPlayback('es', vi.fn(), vi.fn());
	disposers.push(player.dispose);
	const playing = player.play('Hola');
	await vi.waitFor(() =>
		expect(
			fetchMock.mock.calls.some((call) => call[0] === '/api/speech/synthesize'),
		).toBe(true),
	);
	windowMock.dispatchEvent(new Event('mr-kane-recording-start'));
	resolve(new Response('audio'));
	await playing;
	expect(instances).toHaveLength(0);
});
it('stops existing playback before another feature begins speaking', async () => {
	const { instances } = setup();
	const first = createSpeechPlayback('es', vi.fn(), vi.fn());
	const second = createSpeechPlayback('es', vi.fn(), vi.fn());
	disposers.push(first.dispose, second.dispose);
	await first.play('First');
	await second.play('Second');
	expect(instances[0].pause).toHaveBeenCalled();
	expect(instances).toHaveLength(2);
});

it('ignores an asynchronous resume completion after playback is stopped', async () => {
 setup(); const changed = vi.fn();
 const player = createSpeechPlayback('es', changed, vi.fn()); disposers.push(player.dispose);
 await player.play('Hola'); player.pause(); player.resume(); player.stop();
 await Promise.resolve();
 expect(changed).toHaveBeenLastCalledWith('idle');
});
