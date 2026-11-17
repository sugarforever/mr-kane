<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import type { SpeechCheck } from '$lib/client/speech-recognition';
	import { compareReading } from '$lib/reading-feedback';
	let {
		check,
		expected,
		language,
	}: { check: SpeechCheck; expected: string; language: 'ga' | 'es' } = $props();
	const comparison = $derived.by(() => {
		try {
			return { words: compareReading(expected, check.transcript), error: '' };
		} catch (e) {
			return {
				words: [],
				error: e instanceof Error ? e.message : 'Word comparison unavailable.',
			};
		}
	});
	const matched = $derived(
		comparison.words.filter((w) => w.type === 'matched').length,
	);
	const differences = $derived(
		comparison.words.filter((w) => w.type !== 'matched'),
	);
</script>

<Alert.Root class="my-3">
	<h3 class="font-semibold">Reading feedback</h3>
	{#if check.message}<p class="my-2">{check.message}</p>{/if}
	{#if check.transcript}
		<h4 class="font-medium mt-3">Recognised speech</h4>
		<p lang={language} class="whitespace-pre-wrap">{check.transcript}</p>
		{#if comparison.error}<p>{comparison.error}</p>
		{:else if comparison.words.length}
			<p class="my-2">
				{differences.length
					? `${matched} words matched the reading text. Try the possible differences below one at a time.`
					: 'The recognised words match the reading text. Nice work! Listen back and try again when you are ready.'}
			</p>
			{#if differences.length}<ul class="list-disc pl-5 space-y-1">
					{#each differences.slice(0, 20) as word}<li>
							{#if word.type === 'missing'}Possibly missed: <span
									lang={language}>{word.expected}</span
								>{:else if word.type === 'extra'}Extra recognised word: <span
									lang={language}>{word.heard}</span
								>{:else}Expected <span lang={language}>{word.expected}</span>;
								recognised <span lang={language}>{word.heard}</span>.{/if}
						</li>{/each}
				</ul>
				{#if differences.length > 20}<p>
						{differences.length - 20} more possible differences. Try a shorter section.
					</p>{/if}{/if}
		{/if}
	{:else}<p>
			No comparison is available. This does not mean you read incorrectly.
		</p>{/if}
	<p class="text-xs mt-3">
		Experimental transcript comparison, not a pronunciation score. Recognition
		can mishear words, accents and dialects. {check.status === 'partial'
			? 'Recognition was incomplete; apparent missing words may not be reading mistakes.'
			: ''}
	</p>
</Alert.Root>
