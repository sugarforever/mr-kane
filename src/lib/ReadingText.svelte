<script lang="ts">
	import { resultTop, selectionAnchor } from '$lib/selection-layout';
	import type { Language } from '$lib/languages';
	import { Check, Info, LoaderCircle, Square } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import { Languages, Volume2, BookPlus } from '@lucide/svelte';
	import { readingItems, type ReadingUnit } from '$lib/reading-levels';
	import ReadingSupport from '$lib/ReadingSupport.svelte';
	import { createSpeechPlayback } from '$lib/client/speech-playback';
	import { readLearningRecords, updateLearning } from '$lib/client/learning';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { readingSelection, selectionLimit } from '$lib/reading';
	let {
		text,
		language,
		unit,
		recording = false,
	}: {
		text: string;
		language: Language;
		unit?: ReadingUnit;
		recording?: boolean;
	} = $props();
	const items = $derived(
		unit === 'words' || unit === 'sentences'
			? readingItems(text)
			: text
					.trim()
					.split(/\n\s*\n/)
					.filter(Boolean),
	);
	let script: HTMLDivElement;
	let selected = $state('');
	let open = $state(false);
	let content = $state<HTMLDivElement>(null!);
	let anchor = $state<{ getBoundingClientRect: () => DOMRect } | null>(null);
	let english = $state('');
	let resultPanel = $state<HTMLDivElement | undefined>();
	let infoPanel = $state<HTMLDivElement | undefined>();
	let message = $state('');
	let loading = $state(false);
	let speaking = $state(false);
	let canPronounce = $state(false);
	let pronunciationSource = $state('Loading speech settings…');
	let speechPlayer: ReturnType<typeof createSpeechPlayback> | undefined;
	let controller: AbortController | undefined;
	let generation = 0;
	let selectionVersion = 0;
	let saving = $state(false);
	let saved = $state(false);
	let knownWords = new Set<string>();
	let alreadySaved = $state(false);
	const wordKey = (word: string) =>
		word
			.normalize('NFC')
			.replace(/\s+/g, ' ')
			.trim()
			.toLocaleLowerCase(language);
	let pointerSelecting = false;
	let touchSelection = $state(false);
	let captureTimer: ReturnType<typeof setTimeout>;
	function cancelTranslation() {
		generation++;
		controller?.abort();
		loading = false;
	}
	function scheduleCapture() {
		clearTimeout(captureTimer);
		if (!pointerSelecting)
			captureTimer = setTimeout(capture, touchSelection ? 140 : 250);
	}
	async function saveWord() {
		if (saving || saved || !selected || selected.length > selectionLimit)
			return;
		const word = selected;
		const version = selectionVersion;
		saving = true;
		message = '';
		try {
			await updateLearning({
				type: 'vocabulary.add',
				entry: { text: word, language, english },
			});
			knownWords.add(wordKey(word));
			if (version === selectionVersion) saved = true;
		} catch {
			if (version === selectionVersion) message = 'Could not save. Try again.';
		} finally {
			if (version === selectionVersion) saving = false;
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
			anchor = {
				getBoundingClientRect: () =>
					selectionAnchor(
						Array.from(range.getClientRects()),
						range.getBoundingClientRect(),
					),
			};
		}
		open = Boolean(next);
		if (next !== selected) {
			selectionVersion++;
			selected = next;
			saved = knownWords.has(wordKey(next));
			alreadySaved = saved;
			saving = false;
			english = '';
			message = '';
			controller?.abort();
			generation++;
			loading = false;
			stop();
		}
	}
	onMount(() => {
		let disposed = false;
		void readLearningRecords()
			.then((records) => {
				if (disposed) return;
				knownWords = new Set([
					...knownWords,
					...records.vocabulary
						.filter((entry) => entry.language === language)
						.map((entry) => wordKey(entry.text)),
				]);
				if (knownWords.has(wordKey(selected))) {
					saved = true;
					alreadySaved = true;
				}
			})
			.catch(() => {
				/* Saving remains available when initial records are unavailable. */
			});
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
		function pointerDown(event: PointerEvent) {
			if (content?.contains(event.target as Node)) return;
			pointerSelecting = true;
			touchSelection = event.pointerType === 'touch';
			clearTimeout(captureTimer);
		}
		function pointerUp() {
			pointerSelecting = false;
			clearTimeout(captureTimer);
			captureTimer = setTimeout(capture, 140);
		}
		document.addEventListener('selectionchange', scheduleCapture);
		document.addEventListener('pointerdown', pointerDown);
		document.addEventListener('pointerup', pointerUp);
		document.addEventListener('pointercancel', pointerUp);
		return () => {
			disposed = true;
			clearTimeout(captureTimer);
			document.removeEventListener('selectionchange', scheduleCapture);
			document.removeEventListener('pointerdown', pointerDown);
			document.removeEventListener('pointerup', pointerUp);
			document.removeEventListener('pointercancel', pointerUp);
			controller?.abort();
			generation++;
			selectionVersion++;
			speechPlayer?.dispose();
		};
	});
	$effect(() => {
		if (recording || !open) stop();
		if (!open) cancelTranslation();
	});
	$effect(() => {
		if (!open || !content) return;
		const panels = [resultPanel, infoPanel].filter(
			(panel): panel is HTMLDivElement => Boolean(panel),
		);
		const toolbar = content;
		function positionResult() {
			const bar = toolbar.getBoundingClientRect();
			for (const panel of panels) {
				const height = panel.getBoundingClientRect().height;
				const preferred =
					toolbar.dataset.side === 'top'
						? bar.top - height - 8
						: bar.bottom + 8;
				panel.style.top = `${resultTop(preferred, height, window.innerHeight) - bar.top}px`;
				panel.style.bottom = 'auto';
			}
		}
		const observer = new ResizeObserver(positionResult);
		for (const panel of panels) observer.observe(panel);
		observer.observe(toolbar);
		const mutation = new MutationObserver(positionResult);
		mutation.observe(toolbar, {
			attributes: true,
			attributeFilter: ['data-side', 'style'],
		});
		window.addEventListener('scroll', positionResult, true);
		window.addEventListener('resize', positionResult);
		void tick().then(positionResult);
		return () => {
			observer.disconnect();
			mutation.disconnect();
			window.removeEventListener('scroll', positionResult, true);
			window.removeEventListener('resize', positionResult);
		};
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
	{#snippet children(listen)}
		<div
			class="reading-script"
			class:reading-inline={unit === 'words' || unit === 'sentences'}
			lang={language}
			bind:this={script}
			tabindex="-1"
			role="group"
			aria-label="Reading script. Select text for translation and vocabulary, or use the listening buttons."
		>
			{#each items as item, index}
				{#if unit === 'words' || unit === 'sentences'}
					<span class="reading-item">{item}{@render listen(item, index)}</span
					>{' '}
				{:else}
					<p class="reading-paragraph">{item}{@render listen(item, index)}</p>
				{/if}
			{/each}
		</div>
	{/snippet}
</ReadingSupport>
<Popover.Root bind:open>
	<Popover.Content
		bind:ref={content}
		customAnchor={anchor}
		trapFocus={false}
		side={touchSelection ? 'bottom' : 'top'}
		sideOffset={touchSelection ? 28 : 8}
		collisionPadding={12}
		aria-label="Selection actions"
		class="selection-popover"
		onpointerdown={(event) => {
			if (
				event.pointerType !== 'touch' &&
				(event.target as HTMLElement).closest('button')
			)
				event.preventDefault();
		}}
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
		<div
			class="selection-toolbar"
			role="group"
			aria-label="Selected text actions"
		>
			{#if language !== 'en'}
				<button
					class="selection-action"
					onclick={loading ? cancelTranslation : translate}
					disabled={selected.length > selectionLimit}
				>
					{#if loading}<LoaderCircle
							class="selection-spinner"
							aria-hidden="true"
						/>{:else}<Languages aria-hidden="true" />{/if}
					{loading ? 'Cancel' : 'Translate'}
				</button>
			{/if}
			<button
				class="selection-action"
				onclick={speaking ? stop : pronounce}
				disabled={!canPronounce ||
					recording ||
					selected.length > selectionLimit}
				title={recording ? 'Stop recording to pronounce' : pronunciationSource}
			>
				{#if speaking}<Square aria-hidden="true" />{:else}<Volume2
						aria-hidden="true"
					/>{/if}{speaking ? 'Stop' : 'Pronounce'}
			</button>
			<button
				class="selection-action"
				class:saved
				class:already-saved={alreadySaved}
				onclick={saveWord}
				disabled={saving || saved || selected.length > selectionLimit}
			>
				{#if saved}<Check aria-hidden="true" />{:else if saving}<LoaderCircle
						class="selection-spinner"
						aria-hidden="true"
					/>{:else}<BookPlus aria-hidden="true" />{/if}{saved
					? alreadySaved
						? 'Already saved'
						: 'Saved'
					: saving
						? 'Saving'
						: 'Save'}
			</button>
			<details class="selection-details">
				<summary aria-label="Speech and translation details"
					><Info aria-hidden="true" /></summary
				>
				<div bind:this={infoPanel} class="selection-info">
					{recording
						? 'Stop recording before playing pronunciation.'
						: pronunciationSource} Translation sends selected text to your configured
					AI model. Requests are saved privately on this server.
				</div>
			</details>
		</div>
		{#if selected.length > selectionLimit || message || english}
			<div bind:this={resultPanel} class="selection-result" aria-live="polite">
				{#if selected.length > selectionLimit}<p>
						Select up to 4,000 characters.
					</p>{/if}
				{#if message}<p role="alert">{message}</p>{/if}
				{#if english}<p class="translation-language">
						{language.toUpperCase()} → EN
					</p>
					<p lang="en">{english}</p>{/if}
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>

<style>
	.reading-script ::selection {
		background: var(--reading-selection);
		color: var(--foreground);
	}
	:global(.selection-popover) {
		width: max-content;
		max-width: calc(100vw - 24px);
		padding: 4px;
		border: 1px solid var(--foreground);
		border-radius: 14px;
		background: var(--background);
		box-shadow: 0 4px 16px var(--sticker-shadow);
		gap: 0;
		overflow: visible;
		animation: selection-enter 160ms cubic-bezier(0.2, 0.8, 0.2, 1) !important;
	}
	:global(.selection-popover[data-state='closed']) {
		animation: selection-exit 100ms ease-in !important;
	}
	.selection-toolbar {
		display: flex;
		align-items: center;
	}
	.selection-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: 10px;
		white-space: nowrap;
		font-size: 14px;
		font-weight: 600;
		transition:
			background 120ms,
			transform 80ms;
	}
	.selection-action :global(svg),
	summary :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}
	.selection-action:hover:not(:disabled) {
		background: var(--muted);
	}
	.selection-action:active:not(:disabled) {
		transform: scale(0.98);
	}
	.selection-action:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--foreground);
		outline-offset: 2px;
	}
	.selection-action:disabled {
		opacity: 0.5;
	}
	.selection-action.saved {
		opacity: 1;
	}
	.saved:not(.already-saved) :global(svg) {
		background: var(--brand-accent);
		border-radius: 50%;
		animation: saved-check 160ms ease-out;
	}
	.selection-details summary {
		list-style: none;
		display: grid;
		place-items: center;
		width: 32px;
		min-height: 44px;
		cursor: pointer;
		border-radius: 10px;
	}
	.selection-details summary::-webkit-details-marker {
		display: none;
	}
	.selection-info,
	.selection-result {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		width: 100%;
		max-height: min(45vh, 24rem);
		overflow-y: auto;
		padding: 14px;
		border: 1px solid var(--foreground);
		border-radius: 14px;
		background: var(--background);
		color: var(--foreground);
		box-shadow: 0 4px 16px var(--sticker-shadow);
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.selection-info {
		z-index: 1;
	}
	:global(.selection-popover[data-side='top']) .selection-result,
	:global(.selection-popover[data-side='top']) .selection-info {
		top: auto;
		bottom: calc(100% + 8px);
	}
	.translation-language {
		font-size: 11px;
		color: var(--muted-foreground);
		margin-bottom: 8px;
	}
	.selection-result {
		animation: result-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	:global(.selection-spinner) {
		animation: selection-spin 800ms linear infinite;
	}
	@keyframes selection-enter {
		from {
			opacity: 0;
			translate: 0 3px;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
	@keyframes selection-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes selection-exit {
		to {
			opacity: 0;
		}
	}
	@keyframes saved-check {
		from {
			transform: scale(0.85);
		}
		to {
			transform: scale(1);
		}
	}
	@keyframes result-enter {
		from {
			clip-path: inset(0 0 100% 0);
		}
		to {
			clip-path: inset(0);
		}
	}
	@keyframes selection-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 480px) {
		:global(.selection-popover) {
			width: calc(100vw - 24px);
		}
		.selection-action {
			padding: 0 7px;
			flex: 1;
			font-size: 13px;
			gap: 5px;
			min-width: 0;
			white-space: normal;
			line-height: 1.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.selection-popover) {
			animation: selection-fade-in 80ms !important;
		}
		.selection-action {
			transition: background 80ms;
		}
		.selection-action:active:not(:disabled) {
			transform: none;
		}
		:global(.selection-spinner),
		.saved :global(svg),
		.selection-result {
			animation: none;
		}
	}

	.reading-script {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.reading-item {
		display: inline;
	}
	.reading-inline {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1.25rem;
	}
	.reading-inline .reading-item {
		max-width: 100%;
	}
	.reading-paragraph {
		margin: 0 0 1em;
		white-space: pre-wrap;
	}
	.reading-paragraph:last-child {
		margin-bottom: 0;
	}
</style>
