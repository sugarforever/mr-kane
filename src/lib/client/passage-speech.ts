export type PlaybackState = 'idle' | 'playing' | 'paused';
export function speechChunks(text: string): string[] {
	// Small utterances avoid browser limits on long passages. Prefer sentence/word boundaries.
	return (
		text
			.match(/[^\n.!?。！？]+[.!?。！？]*|[.!?。！？]+/g)
			?.flatMap((sentence) => {
				const chunks: string[] = [];
				let rest = sentence.trim();
				while (rest.length > 220) {
					const split = rest.lastIndexOf(' ', 220);
					const end = split > 0 ? split : 220;
					chunks.push(rest.slice(0, end));
					rest = rest.slice(end).trim();
				}
				if (rest) chunks.push(rest);
				return chunks;
			}) ?? []
	);
}
export function createPassageSpeech(
	synth: SpeechSynthesis,
	changed: (state: PlaybackState, error?: string) => void,
	makeUtterance = (text: string) => new SpeechSynthesisUtterance(text),
) {
	let current: SpeechSynthesisUtterance | undefined;
	let chunks: string[] = [];
	let disposed = false;
	function stop() {
		const owned = !!current;
		if (current) {
			current.onend = null;
			current.onerror = null;
		}
		current = undefined;
		chunks = [];
		if (owned) synth.cancel();
		changed('idle');
	}
	function playNext(voice: SpeechSynthesisVoice, rate: number) {
		const text = chunks.shift();
		if (!text || disposed) {
			current = undefined;
			changed('idle');
			return;
		}
		const utterance = makeUtterance(text);
		current = utterance;
		utterance.voice = voice;
		utterance.lang = voice.lang;
		utterance.rate = rate;
		utterance.onend = () => {
			if (current === utterance) playNext(voice, rate);
		};
		utterance.onerror = (event) => {
			if (current !== utterance) return;
			current = undefined;
			chunks = [];
			changed(
				'idle',
				['canceled', 'interrupted'].includes(event.error)
					? undefined
					: 'Reading could not play. Please try again.',
			);
		};
		try {
			synth.speak(utterance);
		} catch {
			current = undefined;
			chunks = [];
			changed('idle', 'Reading could not play. Please try again.');
		}
	}
	return {
		play(text: string, voice: SpeechSynthesisVoice, rate: number) {
			if (disposed || !voice.localService) return;
			stop();
			synth.cancel();
			synth.resume();
			chunks = speechChunks(text);
			changed('playing');
			playNext(voice, rate);
		},
		pause() {
			if (current) {
				synth.pause();
				changed('paused');
			}
		},
		resume() {
			if (current) {
				synth.resume();
				changed('playing');
			}
		},
		stop,
		dispose() {
			disposed = true;
			stop();
		},
	};
}
