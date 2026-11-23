<script lang="ts">
	import type { Learner } from '$lib/math';
	let { learner }: { learner?: Learner } = $props();
	let dialog: HTMLDialogElement;
	const groups = $derived([
		{
			title: 'What you’ve studied (self-reported)',
			items: learner?.reportedKnowledge ?? [],
		},
		{ title: 'Strengths demonstrated', items: learner?.strengths ?? [] },
		{ title: 'Ideas to work on', items: learner?.gaps ?? [] },
		{ title: 'Learning observations', items: learner?.observations ?? [] },
	]);
</script>

<section class="profile" aria-label="Learning summary">
	<h2>Your learning profile</h2>
	<p class="intro">
		A picture of this conversation’s learning. You can correct it in the chat at
		any time.
	</p>
	<dl>
		<dt>Learning goal</dt>
		<dd>{learner?.summary?.goal || 'Still to explore together.'}</dd>
		<dt>Current understanding</dt>
		<dd>
			{learner?.summary?.currentLevel || 'Still to explore through your work.'}
		</dd>
		<dt>Next step</dt>
		<dd>
			{learner?.summary?.nextStep ||
				'Share a goal or try a short diagnostic in the chat.'}
		</dd>
	</dl>
	<button class="record-button" onclick={() => dialog.showModal()}
		>View complete record</button
	>
</section>

<dialog bind:this={dialog} aria-labelledby="math-profile-title">
	<div class="dialog-header">
		<h2 id="math-profile-title">Complete learning record</h2>
		<button
			onclick={() => dialog.close()}
			aria-label="Close learning record">Close</button
		>
	</div>
	<div class="record-body">
		<p class="intro">
			Saved understanding from this conversation. Observations are learning
			evidence, not a dated history of every change. Correct any detail in the
			chat.
		</p>
		<details>
			<summary>Background, goal and study time</summary>
			<dl>
				<dt>Background</dt>
				<dd>{learner?.background || 'Not yet shared.'}</dd>
				<dt>Working toward</dt>
				<dd>{learner?.goal || 'Not yet shared.'}</dd>
				<dt>Study time</dt>
				<dd>{learner?.weeklyTime || 'Not yet shared.'}</dd>
			</dl>
		</details>
		{#each groups as group}
			<details>
				<summary>{group.title} <span>({group.items.length})</span></summary>
				{#if group.items.length}
					<ul>
						{#each group.items as item}<li>{item}</li>{/each}
					</ul>
				{:else}<p class="intro">No entries yet.</p>{/if}
			</details>
		{/each}
	</div>
</dialog>

<style>
	.profile {
		font-size: 12px;
	}
	h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 0;
	}
	.intro {
		font-size: 12px;
		color: var(--math-muted-foreground);
		line-height: 1.8;
		margin: 14px 0 20px;
	}
	dt {
		font-size: 11px;
		font-weight: 600;
		color: var(--math-description);
		margin: 20px 0 6px;
	}
	dd,
	li {
		font-size: 12px;
		line-height: 1.8;
		margin: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	button {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 8px 12px;
		cursor: pointer;
		font-size: 12px;
		color: var(--foreground);
		background: var(--card);
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--foreground);
		outline-offset: 3px;
	}
	.record-button {
		margin-top: 22px;
		width: 100%;
	}
	dialog {
		color: var(--foreground);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0;
		margin: auto;
		width: min(640px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	dialog::backdrop {
		background: var(--settings-backdrop);
	}
	.dialog-header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 20px;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}
	.record-body {
		padding: 0 20px 20px;
	}
	details {
		border-top: 1px solid var(--border);
		padding: 14px 0;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	summary span {
		color: var(--math-muted-foreground);
		font-weight: 400;
	}
	ul {
		list-style: disc;
		padding-left: 20px;
		margin-top: 12px;
	}
	li + li {
		margin-top: 10px;
	}
</style>
