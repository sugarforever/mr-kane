<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import MathCoursePlans from '$lib/components/MathCoursePlans.svelte';
	import type { MathPlanEntry } from '$lib/server/math/study';
	let { data } = $props();
	let busy = $state(false),
		notice = $state('');
	const selected = $derived(
		data.plans.find(
			(entry: MathPlanEntry) =>
				entry.ownerSessionId === page.url.searchParams.get('owner') &&
				entry.plan.id === page.url.searchParams.get('plan'),
		),
	);
	const nextLesson = $derived(
		selected?.plan.lessons.find(
			(l) => l.status === 'in-progress' || l.status === 'paused',
		) ?? selected?.plan.lessons.find((l) => l.status === 'planned'),
	);
	const detailRequested = $derived(page.url.searchParams.has('plan'));
	async function post(path: string, body: unknown) {
		const response = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const result = await response.json();
		if (!response.ok) throw Error(result.message ?? 'Please try again.');
		return result;
	}
	async function openLesson(entry: MathPlanEntry, courseId: string) {
		if (busy) return;
		busy = true;
		notice = '';
		try {
			const session = await post('/api/math/plans/lesson', {
				ownerSessionId: entry.ownerSessionId,
				planId: entry.plan.id,
				courseId,
			});
			await goto(`/math?session=${session.id}`);
		} catch (e) {
			notice = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function planWithCoach(owner = data.planningSessionId) {
		if (busy) return;
		busy = true;
		notice = '';
		try {
			const id = owner ?? (await post('/api/math/sessions', {})).id;
			await goto(`/math?session=${id}&planning=1`);
		} catch (e) {
			notice = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function retry() {
		busy = true;
		try {
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Learning plans · Math · Mr. Kane</title></svelte:head>
<main aria-busy={busy}>
	<nav aria-label="Math navigation">
		<Button variant="ghost" href={selected ? '/math/plans' : '/math'}
			>{selected ? '← All learning plans' : '← Math conversations'}</Button
		>
	</nav>
	<header>
		<div>
			<p class="eyebrow">YOUR MATH SPACE</p>
			<h1>{selected?.plan.title ?? 'Learning plans'}</h1>
		</div>
		<Button disabled={busy || !!data.failure} onclick={() => planWithCoach()}
			>Create with coach</Button
		>
	</header>
	{#if busy}<p role="status">Opening your learning space…</p>{/if}
	{#if notice}<p role="alert">{notice}</p>{/if}
	{#if data.failure}<p role="alert">{data.failure}</p>
		<Button disabled={busy} onclick={retry}>Retry</Button>
	{:else if detailRequested && !selected}<h2>Plan not found</h2>
		<p>
			This saved plan is unavailable. Return to the list or its original
			conversation.
		</p>
		<Button href="/math/plans">All learning plans</Button>
	{:else if selected}
		<p>
			Planned in <a href={`/math?session=${selected.ownerSessionId}`}
				>{selected.ownerTitle}</a
			>. Lesson conversations keep your answers and assistance history.
		</p>
		<p>
			<strong>Next step:</strong>
			{nextLesson?.report?.nextStep ??
				nextLesson?.title ??
				selected.plan.lessons.at(-1)?.report?.nextStep ??
				'Review completed lessons and arrange delayed practice.'}
		</p>
		<MathCoursePlans
			showPlanning={false}
			plans={[selected.plan]}
			disabled={busy}
			onStudy={() => planWithCoach(selected.ownerSessionId)}
			onLesson={(_planId, courseId) => openLesson(selected, courseId)}
		/>
	{:else if !data.plans.length}<section class="empty">
			<h2>Your next step starts here</h2>
			<p>
				Create a personalized plan with your coach. Saved plans appear here
				immediately, with a conversation for each lesson.
			</p>
			<p>
				If a plan exists only in an older conversation, open it and use
				“Organize plan and sync progress” to save it with its original evidence.
			</p>
			<Button disabled={busy} onclick={() => planWithCoach()}
				>Make a study plan</Button
			>
		</section>
	{:else}<section class="plans" aria-label="Saved learning plans">
			{#each data.plans as entry}<a
					class="plan"
					href={`/math/plans?owner=${entry.ownerSessionId}&plan=${encodeURIComponent(entry.plan.id)}`}
					><h2>{entry.plan.title}</h2>
					<p>
						{entry.plan.lessons.filter((l) => l.status === 'completed').length} /
						{entry.plan.lessons.length} lessons completed
					</p>
					<progress
						max={entry.plan.lessons.length}
						value={entry.plan.lessons.filter((l) => l.status === 'completed')
							.length}
						aria-label={`${entry.plan.title} completion`}
					></progress>
					<p>
						Next: {entry.plan.lessons.find(
							(l) => l.status === 'in-progress' || l.status === 'paused',
						)?.title ??
							entry.plan.lessons.find((l) => l.status === 'planned')?.title ??
							'Review completed lessons'}
					</p>
					<small>{entry.ownerTitle} · revision {entry.plan.revision}</small></a
				>{/each}
		</section>{/if}
</main>

<style>
	main {
		max-width: 68rem;
		margin: auto;
		padding: clamp(1rem, 4vw, 3rem);
		color: var(--foreground);
		overflow-wrap: anywhere;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-block: 2rem;
		align-items: center;
	}
	h1 {
		font-size: clamp(1.8rem, 5vw, 2.8rem);
		font-weight: 600;
	}
	h2 {
		font-size: 1.2rem;
		font-weight: 600;
	}
	p {
		margin-block: 0.8rem;
		line-height: 1.7;
	}
	.eyebrow,
	small {
		color: var(--muted-foreground);
	}
	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.1em;
	}
	.plans {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 1rem;
	}
	.plan,
	.empty {
		border: 1px solid var(--border);
		border-radius: 1rem;
		padding: 1.5rem;
		background: var(--card);
	}
	.plan:hover {
		border-color: var(--primary);
	}
	progress {
		width: 100%;
		accent-color: var(--primary);
	}
	a {
		text-underline-offset: 0.2em;
	}
</style>
