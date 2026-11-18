<script lang="ts">
	import { onMount } from 'svelte';
	import { Languages, Volume2, BookPlus } from '@lucide/svelte';
	import type { ReadingUnit } from '$lib/reading-levels';
	import ReadingSupport from '$lib/ReadingSupport.svelte';
	import { createSpeechPlayback } from '$lib/client/speech-playback';
	import { addVocabulary } from '$lib/client/vocabulary';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { readingSelection, selectionLimit } from '$lib/reading';
	let {
		text,
		language,
		unit,
		recording = false,
	}: {
		text: string;
		language: 'ga' | 'es';
		unit?: ReadingUnit;
		recording?: boolean;
	} = $props();
	let script: HTMLDivElement;
	let selected = $state('');
	let open = $state(false);
	let content = $state<HTMLDivElement>(null!);
	let anchor = $state<{ getBoundingClientRect: () => DOMRect } | null>(null);
	let english = $state('');
	let message = $state('');
	let loading = $state(false);
	let speaking = $state(false);
	let canPronounce = $state(false);
	let pronunciationSource = $state('Loading speech settings…');
	let speechPlayer: ReturnType<typeof createSpeechPlayback> | undefined;
	let controller: AbortController | undefined;
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
		speechPlayer?.stop();
		speaking = false;
	}
	function capture() {
		if (content?.contains(document.activeElement)) return;
		const selection = window.getSelection();
		const next = readingSelection(selection, script);
		if (next && selection) {
			const range = selection.getRangeAt(0).cloneRange();
			anchor = { getBoundingClientRect: () => range.getBoundingClientRect() };
		}
		if (next !== selected) open = Boolean(next);
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
		speechPlayer = createSpeechPlayback(
			language,
			(state, error) => {
				speaking = state !== 'idle';
				if (error) message = error;
			},
			(info) => {
				canPronounce = info.available;
				pronunciationSource = info.description;
			},
		);
		document.addEventListener('selectionchange', capture);
		document.addEventListener('pointerup', capture);
		return () => {
			document.removeEventListener('selectionchange', capture);
			document.removeEventListener('pointerup', capture);
			controller?.abort();
			generation++;
			speechPlayer?.dispose();
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
		if (
			!canPronounce ||
			recording ||
			!selected ||
			selected.length > selectionLimit
		)
			return;
		message = '';
		void speechPlayer?.play(selected, 0.85);
	}
</script>

<ReadingSupport {text} {language} {recording} {unit}>
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
	Select a word or passage to see translation, pronunciation and vocabulary
	actions. For keyboard selection, enable your browser’s caret browsing and use
	Shift + arrow keys.
</p>
<Popover.Root bind:open>
	<Popover.Content
		bind:ref={content}
		customAnchor={anchor}
		trapFocus={false}
		side="top"
		sideOffset={8}
		collisionPadding={12}
		aria-label="Selection actions"
		class="w-[min(27rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto"
		onOpenAutoFocus={(e) => {
			if (anchor) e.preventDefault();
		}}
		onCloseAutoFocus={(e) => {
			e.preventDefault();
			if (
				document.activeElement === document.body ||
				content?.contains(document.activeElement)
			)
				script?.focus({ preventScroll: true });
		}}
	>
		{#if selected.length > selectionLimit}
			<Alert.Root role="status"
				>Select a shorter passage: up to 4,000 characters. Your selection has {selected.length.toLocaleString(
					'en-IE',
				)}.</Alert.Root
			>
		{:else}
			<div class="flex flex-wrap gap-2">
				<Button onclick={translate} disabled={loading || !selected}
					><Languages aria-hidden="true" />{loading
						? 'Translating…'
						: 'Translate'}</Button
				>
				<Button
					variant="outline"
					onclick={pronounce}
					disabled={!canPronounce || recording || !selected || speaking}
					><Volume2 aria-hidden="true" />Pronounce</Button
				>
				<Button variant="outline" onclick={saveWord} disabled={!selected}
					><BookPlus aria-hidden="true" />Add to vocabulary</Button
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
		<details class="text-xs text-muted-foreground">
			<summary class="cursor-pointer">Speech and translation details</summary>
			<p class="text-sm text-muted-foreground">
				{recording
					? 'Stop recording before playing pronunciation.'
					: pronunciationSource}
			</p>
			<p class="text-sm text-muted-foreground mt-2">
				Translation sends only the selected text and its language to your
				configured AI model. Requests are saved privately on this server for
				recovery.
			</p>
		</details>
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
