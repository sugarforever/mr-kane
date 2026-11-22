<script lang="ts">
	import { onDestroy } from 'svelte';
	import { BookOpen, ArrowLeft, ArrowUpRight, Search } from '@lucide/svelte';
	import { renderMathMarkdown } from '$lib/math-markdown';
	import type { IrmoBrowse, IrmoPassage } from '$lib/irmo';
	let {
		library,
		disabled = false,
		onStudy,
		onClose,
	}: {
		library: IrmoBrowse;
		disabled?: boolean;
		onStudy: (message: string) => void;
		onClose: () => void;
	} = $props();
	let year = $state('2026'),
		paper = $state(''),
		topic = $state(''),
		query = $state('');
	let selected: IrmoPassage | null = $state(null);
	let loading = $state(false),
		notice = $state('');
	let controller: AbortController | undefined;
	const topicName = (name: string) =>
		name === 'number-theory'
			? 'Number theory'
			: name[0].toUpperCase() + name.slice(1);
	let questions = $derived(
		library.questions
			.filter(
				(q) =>
					(!year || String(q.year) === year) &&
					(!paper || String(q.paper) === paper) &&
					(!topic || q.topics.includes(topic)) &&
					query
						.toLowerCase()
						.split(/[^\p{L}\p{N}]+/u)
						.every((t) =>
							`${q.id} ${q.title} ${q.keywords} ${q.topics.join(' ')}`
								.toLowerCase()
								.includes(t),
						),
			)
			.sort((a, b) => b.year - a.year || a.number - b.number),
	);
	onDestroy(() => controller?.abort());
	function back() {
		controller?.abort();
		loading = false;
		selected = null;
		notice = '';
	}
	async function open(id: string) {
		controller?.abort();
		const current = new AbortController();
		controller = current;
		loading = true;
		notice = '';
		selected = null;
		try {
			const response = await fetch(
				`/api/math/irmo?id=${encodeURIComponent(id)}`,
				{ signal: current.signal },
			);
			if (!response.ok)
				throw new Error('This question could not be loaded. Please try again.');
			const result = await response.json();
			if (!current.signal.aborted) selected = result;
		} catch (e) {
			if (!current.signal.aborted) notice = (e as Error).message;
		} finally {
			if (!current.signal.aborted) loading = false;
		}
	}
</script>

<section class="irmo-library" aria-label="Irish Mathematical Olympiad library">
	<div class="library-top">
		<span class="eyebrow">YOUR STUDY LIBRARY</span><button
			class="text-button"
			onclick={onClose}><ArrowLeft size={15} /> Conversation</button
		>
	</div>
	<h2>Irish Mathematical Olympiad</h2>
	<p class="intro">Round 2 · The national final</p>
	{#if !selected && !loading}
		<p class="description">
			Explore both papers, work through a proof, or build your preparation with
			AoPS.
		</p>
		<div class="coverage">
			<BookOpen size={19} />
			<p>
				<strong>National finals 2011–2026 · 32 papers · 160 questions</strong
				><br />Paper 1: Q1–5 · Paper 2: Q6–10
			</p>
		</div>
		<div class="library-actions">
			<button
				class="primary-button"
				{disabled}
				onclick={() =>
					onStudy(
						'Help me prepare for Irish Mathematical Olympiad Round 2. Ask about my background, target and available study time, then suggest a short diagnostic and a plan linking retrieved IrMO questions to AoPS prerequisites.',
					)}><ArrowUpRight size={16} /> Plan my preparation</button
			><a
				href={library.source.archive}
				target="_blank"
				rel="noopener noreferrer">Official source archive ↗</a
			>
		</div>
		<p class="history">
			Round 2 finals: 2012–2026. The May 2011 final is extra practice, before
			school Round 1 began that November. Earlier finals (1988–2010) are in the
			source archive.
		</p>
	{/if}
	{#if selected || loading}
		<button class="text-button back" onclick={back}
			><ArrowLeft size={15} /> Back to questions</button
		>
		{#if loading}<p role="status">Loading question…</p>{:else if selected}
			<article class="question-preview">
				<span class="question-id"
					>{selected.id} · {selected.date}{selected.stage ===
					'predecessor-final'
						? ' · Predecessor final'
						: ''}</span
				>
				<div class="question-prose">
					{@html renderMathMarkdown(selected.content)}
				</div>
				<div class="tags">
					{#each selected.topics as t}<span>{topicName(t)}</span>{/each}
				</div>
				<div class="prerequisites">
					<h3>Build the foundations with AoPS</h3>
					<p>
						Suggested starting points; your coach can adapt them to what you
						already know.
					</p>
					<ul>
						{#each selected.aops as a}<li>
								<strong
									>{a.chapterId}{a.section ? ` · §${a.section}` : ''}</strong
								>
								· {a.title.replace(/\$/g, '')}
							</li>{/each}
					</ul>
				</div>
				<div class="library-actions">
					<button
						class="primary-button"
						{disabled}
						onclick={() =>
							onStudy(
								`Help me study ${selected!.id} (IrMO ${selected!.year}, Paper ${selected!.paper}, original Question ${selected!.number}). Retrieve its statement first. Start with a small hint and connect any missing prerequisites to AoPS. Ask what I have tried.`,
							)}>Work on this with my coach <ArrowUpRight size={16} /></button
					><a href={selected.source} target="_blank" rel="noopener noreferrer"
						>Original paper · page {selected.printedPage} ↗</a
					><a href={selected.scanUrl} target="_blank" rel="noopener noreferrer"
						>View source page ↗</a
					>
				</div>
				<p class="attribution">
					Source: {selected.attribution}, <em>{library.source.title}</em>.
					Question statements are adapted for study. Topic tags and AoPS links
					are editorial.
				</p>
			</article>
		{/if}
	{:else}
		<div class="filters">
			<label
				>Year<select bind:value={year}
					><option value="">All collected years</option
					>{#each [...library.years].reverse() as y}<option value={String(y)}
							>{y}{y === 2011 ? ' · earlier final' : ''}</option
						>{/each}</select
				></label
			>
			<label
				>Paper<select bind:value={paper}
					><option value="">Both papers</option><option value="1"
						>Paper 1 · Q1–5</option
					><option value="2">Paper 2 · Q6–10</option></select
				></label
			>
			<label
				>Topic<select bind:value={topic}
					><option value="">All topics</option
					>{#each library.topics as t}<option value={t}>{topicName(t)}</option
						>{/each}</select
				></label
			>
			<label class="search-label"
				><span><Search size={13} /> Search questions</span><input
					bind:value={query}
					placeholder="Topic, title or question ID"
					maxlength={150}
				/></label
			>
		</div>
		<p class="results-count" aria-live="polite">
			{questions.length}
			{questions.length === 1 ? 'question' : 'questions'}
		</p>
		<div class="question-list">
			{#each questions as q}<button
					onclick={() => open(q.id)}
					aria-label={`Open IrMO ${q.year} Paper ${q.paper} Question ${q.number}`}
					><span class="question-number"
						>{q.year}<small>P{q.paper} · Q{q.number}</small></span
					><span class="question-detail"
						><strong>{q.title}</strong><small
							>{q.topics.map(topicName).join(' · ')}{q.hasDiagram
								? ' · Source diagram'
								: ''}{q.stage === 'predecessor-final'
								? ' · Earlier final'
								: ''}</small
						></span
					><ArrowUpRight size={17} /></button
				>{/each}
		</div>
		{#if !questions.length}<div class="no-results">
				No questions match these filters. Try another year or a broader topic.<button
					class="text-button"
					onclick={() => {
						year = '';
						paper = '';
						topic = '';
						query = '';
					}}>Clear filters</button
				>
			</div>{/if}
	{/if}
	{#if notice}<p role="alert">{notice}</p>{/if}
	<p class="footer-note">
		You can browse papers without a coach connection. Coaching uses the AI
		connection selected above.
	</p>
</section>

<style>
	.irmo-library {
		min-height: 0;
		padding: 28px 36px 40px;
		max-width: 1000px;
		width: 100%;
		margin: 0 auto;
		overflow: auto;
		overscroll-behavior: contain;
	}
	@media (max-width: 700px) {
		.irmo-library {
			overflow: visible;
			overscroll-behavior: auto;
		}
	}
	.library-top,
	.library-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 1.8px;
		color: var(--math-label);
		font-weight: 600;
	}
	h2 {
		font-family: Georgia, serif;
		font-size: 34px;
		line-height: 1.15;
		margin: 22px 0 8px;
		letter-spacing: -0.7px;
	}
	.intro {
		font-weight: 600;
		color: var(--library-muted-foreground);
		font-size: 15px;
	}
	.description {
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted-foreground);
		margin: 12px 0 18px;
	}
	.coverage {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--library-surface);
		padding: 14px 18px;
		border-radius: 9px;
		color: var(--library-foreground);
		font-size: 12px;
		line-height: 1.8;
	}
	.library-actions {
		justify-content: flex-start;
		margin: 18px 0;
		font-size: 12px;
	}
	.library-actions a {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.primary-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--library-primary);
		color: var(--primary-foreground);
		border: 0;
		border-radius: 7px;
		padding: 11px 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.primary-button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.text-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--library-muted-foreground);
		cursor: pointer;
	}
	.back {
		margin: 16px 0;
	}
	.history,
	.attribution,
	.footer-note {
		font-size: 11px;
		color: var(--muted-foreground);
		line-height: 1.7;
	}
	.history {
		margin-bottom: 24px;
	}
	.footer-note {
		margin-top: 26px;
	}
	.filters {
		display: grid;
		grid-template-columns: 1fr 1fr 1.3fr;
		gap: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 7px;
		font-size: 11px;
		font-weight: 600;
	}
	select,
	input {
		border: 1px solid var(--border);
		padding: 10px;
		border-radius: 6px;
		background: var(--background);
		width: 100%;
		font-size: 12px;
	}
	.search-label {
		grid-column: 1/-1;
	}
	.search-label span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.results-count {
		font-size: 11px;
		margin: 18px 0 10px;
		color: var(--muted-foreground);
	}
	.question-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 9px;
		overflow: hidden;
	}
	.question-list button {
		display: flex;
		align-items: center;
		text-align: left;
		gap: 16px;
		padding: 16px;
		background: var(--background);
		cursor: pointer;
		border-bottom: 1px solid var(--border);
	}
	.question-list button:last-child {
		border: 0;
	}
	.question-list button:hover {
		background: var(--math-sidebar);
	}
	.question-number {
		font-size: 14px;
		font-family: Georgia, serif;
		min-width: 48px;
	}
	.question-number small {
		display: block;
		font-family: inherit;
		font-size: 11px;
		color: var(--muted-foreground);
		margin-top: 3px;
	}
	.question-detail {
		flex: 1;
		min-width: 0;
	}
	.question-detail strong {
		font-size: 13px;
	}
	.question-detail small {
		display: block;
		margin-top: 5px;
		color: var(--muted-foreground);
		font-size: 10px;
	}
	.question-preview {
		border: 1px solid var(--border);
		padding: 24px;
		border-radius: 9px;
	}
	.question-id {
		font-size: 10px;
		color: var(--muted-foreground);
	}
	.question-prose {
		font-size: 14px;
		line-height: 1.85;
	}
	.question-prose :global(h2) {
		font-family: Georgia, serif;
		font-size: 24px;
		line-height: 1.3;
		margin: 16px 0;
	}
	.question-prose :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 6px;
	}
	.question-prose :global(.katex-display) {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 8px 0;
	}
	.question-prose :global(ul) {
		list-style: disc;
		padding-left: 22px;
	}
	.question-prose :global(p) {
		margin: 14px 0;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 18px 0;
	}
	.tags span {
		font-size: 10px;
		padding: 4px 8px;
		border-radius: 5px;
		background: var(--library-surface);
		color: var(--library-muted-foreground);
	}
	.prerequisites {
		border-top: 1px solid var(--border);
		padding-top: 16px;
	}
	.prerequisites h3 {
		font-size: 13px;
		font-weight: 600;
	}
	.prerequisites p,
	.prerequisites li {
		font-size: 11px;
		line-height: 1.7;
		color: var(--muted-foreground);
	}
	.prerequisites p {
		margin: 7px 0;
	}
	.prerequisites ul {
		list-style: disc;
		padding-left: 18px;
	}
	.attribution {
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}
	.no-results {
		padding: 30px 12px;
		font-size: 13px;
		line-height: 1.8;
	}
	.no-results button {
		display: block;
		margin-top: 10px;
	}
	@media (max-width: 600px) {
		.irmo-library {
			padding: 24px 16px;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
		}
		.filters label:nth-child(3) {
			grid-column: 1/-1;
		}
		h2 {
			font-size: 29px;
		}
		.question-preview {
			padding: 16px;
		}
		.question-list button {
			padding: 14px 12px;
			gap: 10px;
		}
		.primary-button {
			font-size: 11px;
		}
	}
</style>
