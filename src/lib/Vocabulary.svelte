<script lang="ts">
	import type { Language } from '$lib/languages';
	import * as Icons from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { readingUnits, type ReadingUnit } from '$lib/reading-levels';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { readLearningRecords, updateLearning } from '$lib/client/learning';
	import type { VocabularyEntry } from '$lib/learning-records';
	let {
		language,
		busy = false,
		canGenerate = false,
		blocked = false,
		ongenerate,
	}: {
		language: Language;
		busy?: boolean;
		canGenerate?: boolean;
		blocked?: boolean;
		ongenerate: (
			words: string[],
			mode: 'writing' | 'speaking',
			unit?: ReadingUnit,
		) => void;
	} = $props();
	let readingUnit = $state<ReadingUnit>('words');
	let entries = $state<VocabularyEntry[]>([]);
	let chosen = $state<string[]>([]);
	const chosenEntries = $derived(
		entries.filter((e) => e.language === language && chosen.includes(e.id)),
	);
	const selectionValid = $derived(
		chosenEntries.length > 0 &&
			chosenEntries.length <= 12 &&
			chosenEntries.every((e) => e.text.length <= 200) &&
			chosenEntries.map((e) => e.text).join(' ').length <= 1000,
	);

	let query = $state('');
	let message = $state('');
	let revealed = $state<string[]>([]);
	let ready = $state(false);
	let onlyUnreviewed = $state(false);
	const visible = $derived(
		entries.filter(
			(e) =>
				e.language === language &&
				(!onlyUnreviewed || !e.reviewedAt) &&
				`${e.text} ${e.english}`
					.toLocaleLowerCase()
					.includes(query.toLocaleLowerCase()),
		),
	);
	async function refresh() {
		try {
			entries = (await readLearningRecords()).vocabulary;
			ready = true;
		} catch {
			ready = false;
			message = 'Could not load vocabulary. Please retry.';
		}
	}
	onMount(() => {
		void refresh();
		const focus = () => {
			void refresh();
		};
		window.addEventListener('focus', focus);
		return () => window.removeEventListener('focus', focus);
	});
	async function update(
		id: string,
		action: 'review' | 'remove' | 'meaning',
		english = '',
	) {
		try {
			const entry = entries.find((e) => e.id === id);
			if (!entry) return;
			const saved = await updateLearning(
				action === 'remove'
					? { type: 'vocabulary.delete', id }
					: {
							type: 'vocabulary.patch',
							id,
							patch:
								action === 'review'
									? {
											reviewedAt: entry.reviewedAt
												? null
												: new Date().toISOString(),
										}
									: { english },
						},
			);
			entries = saved.vocabulary;
			message =
				action === 'remove'
					? 'Vocabulary entry removed.'
					: 'Vocabulary saved on this server.';
		} catch {
			message = 'Could not save vocabulary. Please retry.';
		}
	}
</script>

<div class="eyebrow">WORDS TO COME BACK TO</div>
<div class="page-heading">
	<div>
		<h1>Vocabulary</h1>
		<p>Recall the meaning, reveal it, then mark the words you have reviewed.</p>
	</div>
</div>
<p class="fineprint">
	Saved on this server, separately for each learning language. Export a text
	backup in My learning profile.
</p>
<div class="flex flex-wrap items-end gap-3 my-4">
	<Label
		>Search vocabulary<Input
			bind:value={query}
			type="search"
			placeholder="Find a word or meaning"
		/></Label
	>
	<Button variant="outline" onclick={() => (onlyUnreviewed = !onlyUnreviewed)}
		><Icons.Eye aria-hidden="true" />{onlyUnreviewed
			? 'Show all words'
			: 'Show words to review'}</Button
	>
	<span class="fineprint">{visible.length} entries</span>
</div>
<Card.Root class="panel my-4">
	<h2>Practise your vocabulary</h2>
	<p>
		Select 1–12 words or short phrases below, then choose a practice. Your
		current language level and learning preferences will be used.
	</p>
	<p class="fineprint">
		Only selected vocabulary and your learning profile are sent to the
		configured AI model. Meanings, review history and the rest of your word list
		stay on this server. Limit: 200 characters per entry and 1,000 characters
		total.
	</p>
	<Label class="block my-3"
		>Reading training unit<NativeSelect bind:value={readingUnit} disabled={busy}
			>{#each readingUnits as unit}<option value={unit.value}
					>{unit.label}</option
				>{/each}</NativeSelect
		></Label
	>
	<p class="fineprint">
		{readingUnits.find((unit) => unit.value === readingUnit)?.description} This choice
		applies to reading practice; writing practice stays unchanged.
	</p>
	<p class="my-2" role="status">{chosenEntries.length} selected</p>
	<div class="flex flex-wrap gap-2">
		<Button
			disabled={!selectionValid || !canGenerate || busy || blocked}
			onclick={() =>
				ongenerate(
					chosenEntries.map((e) => e.text),
					'writing',
				)}
			><Icons.Sparkles aria-hidden="true" />{busy
				? 'Preparing…'
				: 'Generate writing practice'}</Button
		>
		<Button
			variant="outline"
			disabled={!selectionValid || !canGenerate || busy || blocked}
			onclick={() =>
				ongenerate(
					chosenEntries.map((e) => e.text),
					'speaking',
					readingUnit,
				)}
			><Icons.Sparkles aria-hidden="true" />Generate reading practice</Button
		>
		<Button
			variant="ghost"
			disabled={busy || !chosen.length}
			onclick={() => (chosen = [])}
			size="icon"
			title="Clear selection"
			aria-label="Clear selection"><Icons.X aria-hidden="true" /></Button
		>
	</div>
	{#if blocked}<p class="fineprint">
			Resolve the unfinished AI request or browser storage error before
			generating another practice.
		</p>{/if}
	{#if !canGenerate}<p class="fineprint">
			Connect an AI model in Settings to generate vocabulary practice.
		</p>{/if}
	{#if chosenEntries.length && !selectionValid}<p role="status">
			Choose up to 12 short words or phrases within the character limits.
		</p>{/if}
</Card.Root>
{#if message}<Alert.Root role="status" class="my-3">{message}</Alert.Root>{/if}
{#each visible as entry (entry.id)}
	<Card.Root class="panel my-4">
		<Label class="flex items-center gap-2 mb-3"
			><Checkbox
				aria-label={`Use ${entry.text.slice(0, 80)} in practice`}
				disabled={busy || entry.text.length > 200}
				checked={chosen.includes(entry.id)}
				onCheckedChange={(checked) =>
					(chosen = checked
						? [...chosen.filter((id) => id !== entry.id), entry.id]
						: chosen.filter((id) => id !== entry.id))}
			/>Use in practice</Label
		>
		{#if entry.text.length > 200}<p class="fineprint">
				This passage is too long for a vocabulary prompt. Save a shorter word or
				phrase from the Reading room.
			</p>{/if}
		<p lang={entry.language} class="whitespace-pre-wrap break-words text-xl">
			{entry.text}
		</p>
		<div class="flex flex-wrap gap-2 my-3">
			<Button
				variant="outline"
				onclick={() =>
					(revealed = revealed.includes(entry.id)
						? revealed.filter((id) => id !== entry.id)
						: [...revealed, entry.id])}
				><Icons.Eye aria-hidden="true" />{revealed.includes(entry.id)
					? 'Hide meaning'
					: 'Reveal / edit meaning'}</Button
			>
			<Button variant="outline" onclick={() => update(entry.id, 'review')}
				><Icons.RefreshCw aria-hidden="true" />{entry.reviewedAt
					? 'Mark for review again'
					: 'Mark reviewed'}</Button
			>
			<Button
				variant="ghost"
				onclick={() => update(entry.id, 'remove')}
				size="icon"
				title="Remove"
				aria-label="Remove"><Icons.Trash2 aria-hidden="true" /></Button
			>
		</div>
		{#if revealed.includes(entry.id)}<Label
				>English meaning<Input
					value={entry.english}
					maxlength={16000}
					placeholder="Add an English meaning or personal note"
					onchange={(e) => update(entry.id, 'meaning', e.currentTarget.value)}
				/></Label
			>{/if}
		<p class="fineprint">
			{entry.reviewedAt
				? `Reviewed ${new Date(entry.reviewedAt).toLocaleDateString('en-IE')}`
				: 'Ready to review'}
		</p>
	</Card.Root>
{:else}
	{#if ready}<Card.Root class="panel"
			>{query || onlyUnreviewed
				? 'No vocabulary matches this view.'
				: 'Your vocabulary is empty. Select unfamiliar text in the Reading room and choose Add to vocabulary. Translate first if you want to save its English meaning too.'}</Card.Root
		>{/if}
{/each}
