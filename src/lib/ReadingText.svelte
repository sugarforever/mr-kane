<script lang="ts">
	import { onMount } from 'svelte';
	import ReadingSupport from '$lib/ReadingSupport.svelte';
	import { addVocabulary } from '$lib/client/vocabulary';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import {
		matchingVoice,
		readingSelection,
		selectionLimit,
	} from '$lib/reading';
	let {
		text,
		language,
		recording = false,
	}: { text: string; language: 'ga' | 'es'; recording?: boolean } = $props();
	let script: HTMLDivElement;
	let keyboardInput = $state<HTMLTextAreaElement>(null!);
	let selected = $state('');
	let open = $state(false);
	let english = $state('');
	let message = $state('');
	let loading = $state(false);
	let speaking = $state(false);
	let voice = $state<SpeechSynthesisVoice>();
	let controller: AbortController | undefined;
	let utterance: SpeechSynthesisUtterance | undefined;
	let generation = 0;
	function saveWord() {
		try {
			const added = addVocabulary(localStorage, {
				text: selected,
				language,
				english,
			});
			message = added
				? 'Added to Vocabulary. Open Vocabulary to review it later.'
				: 'Already in Vocabulary. Any new English meaning has been saved.';
		} catch {
			message =
				'Could not save vocabulary. Check browser storage and try again.';
		}
	}
	function stop() {
		if (utterance) {
			utterance.onend = null;
			utterance.onerror = null;
			window.speechSynthesis?.cancel();
		}
		utterance = undefined;
		speaking = false;
	}
	function capture() {
		if (open || document.activeElement === keyboardInput) return; // Keep a snapshot while the action UI owns focus.
		const selection = window.getSelection();
		if (!selection?.anchorNode || !script.contains(selection.anchorNode))
			return;
		const next = readingSelection(selection, script);
		if (next !== selected) {
			selected = next;
			english = '';
			message = '';
			controller?.abort();
			generation++;
			loading = false;
			stop();
		}
	}
	onMount(() => {
		const synth = window.speechSynthesis;
		const voices = () => {
			voice = synth ? matchingVoice(synth.getVoices(), language) : undefined;
		};
		voices();
		synth?.addEventListener('voiceschanged', voices);
		document.addEventListener('selectionchange', capture);
		return () => {
			synth?.removeEventListener('voiceschanged', voices);
			document.removeEventListener('selectionchange', capture);
			controller?.abort();
			generation++;
			stop();
		};
	});
	$effect(() => {
		if (recording || !open) stop();
	});
	async function translate() {
		if (!selected || selected.length > selectionLimit || loading) return;
		controller?.abort();
		controller = new AbortController();
		const version = ++generation;
		loading = true;
		message = '';
		english = '';
		try {
			const response = await fetch('/api/translate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-request-id': crypto.randomUUID(),
				},
				body: JSON.stringify({ text: selected, language }),
				signal: controller.signal,
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(
					result.message || 'Translation failed. Please try again.',
				);
			if (version === generation) english = result.english;
		} catch (e) {
			if (version === generation && !controller.signal.aborted)
				message =
					e instanceof Error
						? e.message
						: 'Translation failed. Please try again.';
		} finally {
			if (version === generation) loading = false;
		}
	}
	function pronounce() {
		if (!voice || recording || !selected || selected.length > selectionLimit)
			return;
		stop();
		window.speechSynthesis.cancel();
		window.speechSynthesis.resume();
		const audio = new SpeechSynthesisUtterance(selected);
		utterance = audio;
		audio.voice = voice;
		audio.lang = voice.lang;
		audio.rate = 0.85;
		audio.onend = () => {
			if (utterance === audio) {
				speaking = false;
				utterance = undefined;
			}
		};
		audio.onerror = () => {
			if (utterance === audio) {
				speaking = false;
				utterance = undefined;
				message = 'Pronunciation could not play. Please try again.';
			}
		};
		message = '';
		speaking = true;
		try {
			window.speechSynthesis.speak(audio);
		} catch {
			stop();
			message = 'Pronunciation could not play. Please try again.';
		}
	}
</script>

<ReadingSupport {text} {language} {recording}>
	<div
		class="reading-script whitespace-pre-wrap"
		lang={language}
		bind:this={script}
		tabindex="0"
		role="textbox"
		aria-readonly="true"
		aria-multiline="true"
		aria-label="Reading script. Select text with touch, a mouse, or Shift and the arrow keys in caret browsing mode."
	>
		{text}
	</div>
</ReadingSupport>
<p class="fineprint">
	Select a word or passage, then open Selection actions. For keyboard selection,
	enable your browser’s caret browsing and use Shift + arrow keys.
</p>
<Collapsible.Root class="my-2">
	<Collapsible.Trigger class="text-sm underline"
		>Keyboard selection field</Collapsible.Trigger
	>
	<Collapsible.Content>
		<p class="fineprint">
			Use Shift + arrow keys to select words, then Tab to Selection actions.
		</p>
		<Textarea
			bind:ref={keyboardInput}
			readonly
			value={text}
			lang={language}
			aria-label="Reading script for keyboard selection"
			rows={4}
			onselect={() => {
				const next = text
					.slice(keyboardInput.selectionStart, keyboardInput.selectionEnd)
					.trim();
				if (next !== selected) {
					selected = next;
					english = '';
					message = '';
					controller?.abort();
					generation++;
					loading = false;
					stop();
				}
			}}
		/>
	</Collapsible.Content>
</Collapsible.Root>
<Popover.Root bind:open>
	<Popover.Trigger
		disabled={!selected}
		class="inline-flex rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
		>Selection actions</Popover.Trigger
	>
	<Popover.Content
		class="w-[min(30rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto"
		onCloseAutoFocus={(e) => {
			e.preventDefault();
			script?.focus();
		}}
	>
		<h3 class="font-semibold">Selected reading text</h3>
		<blockquote
			lang={language}
			class="my-3 whitespace-pre-wrap break-words max-h-36 overflow-y-auto"
		>
			{selected}
		</blockquote>
		{#if selected.length > selectionLimit}
			<Alert.Root role="status"
				>Select a shorter passage: up to 4,000 characters. Your selection has {selected.length.toLocaleString(
					'en-IE',
				)}.</Alert.Root
			>
		{:else}
			<div class="flex flex-wrap gap-2 my-3">
				<Button variant="outline" onclick={saveWord} disabled={!selected}
					>Add to vocabulary</Button
				>
				<Button onclick={translate} disabled={loading || !selected}
					>{loading ? 'Translating…' : 'Translate to English'}</Button
				>
				<Button
					variant="outline"
					onclick={pronounce}
					disabled={!voice || recording || !selected || speaking}
					>Pronounce</Button
				>
				{#if speaking}<Button variant="outline" onclick={stop}
						>Stop pronunciation</Button
					>{/if}
				{#if loading}<Button
						variant="outline"
						onclick={() => {
							generation++;
							controller?.abort();
							loading = false;
						}}>Cancel translation</Button
					>{/if}
			</div>
		{/if}
		<p class="text-sm text-muted-foreground">
			{recording
				? 'Stop recording before playing pronunciation.'
				: voice
					? `Browser pronunciation · ${voice.name} (${voice.lang}). Uses a local device voice, not AI-generated audio.`
					: `Pronunciation unavailable: no local ${language === 'ga' ? 'Irish' : 'Spanish'} browser voice was found. Install a matching device voice and reload. No substitute language voice will be used.`}
		</p>
		<p class="text-sm text-muted-foreground mt-2">
			Translation sends only the selected text and its language to your
			configured AI model. Requests are saved privately on this server for
			recovery.
		</p>
		{#if message}<Alert.Root class="mt-3" role="alert">{message}</Alert.Root
			>{/if}
		{#if english}<Alert.Root class="mt-3" role="status"
				><h4 class="font-semibold">English translation</h4>
				<p class="whitespace-pre-wrap" lang="en">{english}</p>
				<p class="text-xs mt-2">
					AI translations can make mistakes.
				</p></Alert.Root
			>{/if}
	</Popover.Content>
</Popover.Root>
