<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { courseCatalog, type CoursePlan } from '$lib/math-courses';
	let {
		plans = [],
		disabled = false,
		onStudy,
		onLesson,
		showPlanning = true,
	}: {
		plans?: CoursePlan[];
		disabled?: boolean;
		onStudy: (message: string) => void;
		showPlanning?: boolean;
		onLesson?: (planId: string, courseId: string) => void;
	} = $props();
	const label = (value: string) => value.replaceAll('-', ' ');
</script>

<section aria-label="Learning plans" class="course-plans">
	<h2>Learning plans</h2>
	{#if showPlanning}<details open={!plans.length}>
			<summary>Start a domain plan</summary>
			<div class="actions">
				{#each courseCatalog.slice(0, 4) as domain}
					<Button
						variant="outline"
						size="sm"
						{disabled}
						onclick={() =>
							onStudy(
								`Create an AoPS chapter-based learning plan for ${domain.title}. Use my existing background and progress; show me the plan and help me choose a starting point.`,
							)}>{domain.title}</Button
					>
				{/each}
			</div>
		</details>
		<Button
			variant="ghost"
			size="sm"
			{disabled}
			onclick={() =>
				onStudy(
					'Use the course planning skill to create or update my learning plan from this conversation and synchronize progress. Cite actual attempts, keep hinted work distinct from independent evidence, and show what remains unverified.',
				)}>Organize plan and sync progress</Button
		>
	{/if}
	{#each plans as plan (plan.id)}
		<article>
			<h3>{plan.title}</h3>
			<p>
				{plan.lessons.filter((l) => l.status === 'completed').length} / {plan
					.lessons.length} chapters completed · {plan.lessons.filter(
					(l) => l.status === 'waived',
				).length} waived
			</p>
			<details>
				<summary>Plan revision {plan.revision}</summary>
				<p>{plan.changeReason}</p>
			</details>
			{#if plan.lessons.some((l) => l.status === 'in-progress' || l.status === 'paused' || l.status === 'planned')}
				<Button
					size="sm"
					{disabled}
					onclick={() =>
						onLesson
							? onLesson(
									plan.id,
									(plan.lessons.find(
										(l) => l.status === 'in-progress' || l.status === 'paused',
									) ?? plan.lessons.find((l) => l.status === 'planned'))!
										.courseId,
								)
							: onStudy(
									`Continue the saved learning plan ${plan.id} (${plan.title}). Resume the current lesson and outstanding task; if none is active, start the next planned chapter.`,
								)}>Continue learning</Button
				>
			{/if}
			<ol>
				{#each plan.lessons as lesson (lesson.courseId)}
					<li>
						<details open={lesson.status === 'in-progress'}>
							<summary
								>{lesson.title} <small>{label(lesson.status)}</small></summary
							>
							<p>{lesson.courseId} · {label(lesson.phase)}</p>
							{#if lesson.definition}<dl>
									<dt>Source</dt>
									<dd>{lesson.definition.source.reference}</dd>
									<dt>Scope</dt>
									<dd>{lesson.definition.scope}</dd>
									<dt>Prerequisites</dt>
									<dd>
										{lesson.definition.prerequisites.join(', ') ||
											'None specified'}
									</dd>
									<dt>Assessment</dt>
									<dd>{lesson.definition.assessment}</dd>
								</dl>{/if}
							{#if onLesson}<Button
									size="sm"
									{disabled}
									onclick={() => onLesson?.(plan.id, lesson.courseId)}
									>Open lesson conversation</Button
								>{/if}
							<ul>
								{#each lesson.objectives as objective}<li>
										{objective.description}
										{#if objective.masteryCriteria}<small
												>Mastery: {objective.masteryCriteria}</small
											>{/if}
									</li>{/each}
							</ul>
							{#if lesson.attempts.length}
								<details>
									<summary>{lesson.attempts.length} recorded attempts</summary>
									{#each lesson.attempts as attempt}
										<p>
											<strong
												>{attempt.id} · {label(attempt.support)} · {attempt.result}</strong
											><br />{attempt.exercise}
										</p>
										<blockquote>{attempt.studentAnswer}</blockquote>
										<p>{attempt.feedback}</p>
									{/each}
								</details>
							{/if}
							{#if lesson.report}
								<details>
									<summary
										>{lesson.status === 'completed'
											? 'Lesson report'
											: 'Learning summary'}</summary
									>
									<p>{lesson.report.summary}</p>
									<p><strong>Next:</strong> {lesson.report.nextStep}</p>
								</details>
							{/if}
						</details>
					</li>
				{/each}
			</ol>
		</article>
	{/each}
</section>

<style>
	.course-plans {
		display: grid;
		gap: 0.8rem;
		margin-bottom: 1.5rem;
		font-size: 0.8rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	h2 {
		font-size: 1rem;
		font-weight: 600;
	}
	h3 {
		font-weight: 600;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-block: 0.7rem;
	}
	summary {
		cursor: pointer;
	}
	article {
		border-top: 1px solid var(--border);
		padding-top: 0.8rem;
	}
	ol,
	ul {
		padding-left: 1rem;
	}
	li {
		margin-block: 0.5rem;
	}
	small {
		display: block;
		color: var(--muted-foreground);
	}
	p {
		white-space: pre-wrap;
		margin-block: 0.5rem;
	}
	blockquote {
		border-left: 2px solid var(--border);
		padding-left: 0.5rem;
		white-space: pre-wrap;
	}
</style>
