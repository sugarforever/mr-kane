<script lang="ts">
	import Brand from '$lib/Brand.svelte';
	import ChatAvatar from '$lib/ChatAvatar.svelte';
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import IrmoLibrary from '$lib/components/IrmoLibrary.svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		ArrowUp,
		BookOpen,
		Calculator,
		Plus,
		RefreshCw,
		Sparkles,
		UserRound,
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { renderMathMarkdown } from '$lib/math-markdown';
	import type { MathSession, MathSummary } from '$lib/math';
	import { readStudyStream, type StudyProgress } from '$lib/study-stream';
	import 'katex/dist/katex.min.css';
	let { data } = $props();
	let session: MathSession | null = $state(untrack(() => data.session));
	let sessions: MathSummary[] = $state(untrack(() => data.sessions));
	let configured = $state(untrack(() => data.aiConfigured));
	let connection = $state(
		untrack(() => data.aiSettings.defaultProviderId ?? ''),
	);
	let draft = $state(''),
		busy = $state(false),
		notice = $state('');
	let progress: StudyProgress | null = $state(null);
	let activeReply: AbortController | undefined;
	onDestroy(() => activeReply?.abort());
	let bottom = $state<HTMLDivElement>();
	let showProfile = $state(false);
	let showLibrary = $state(false);
	async function studyIrmo(message: string) {
		if (busy || session?.pending) return;
		draft = message;
		showLibrary = false;
		await tick();
		document.getElementById('math-message')?.focus();
	}
	const starters = [
		{
			title: 'Find my starting point',
			detail: 'Tell me a little about yourself',
			message:
				'Help me find my starting point in math. Ask about my background and give me a short diagnostic.',
		},
		{
			title: 'Make a study plan',
			detail: 'A route that fits your goals',
			message:
				'Help me build an AoPS study plan. Find out my current background, goals and time available.',
		},
		{
			title: 'Explore the books',
			detail: 'See the whole picture',
			message:
				'Give me an overview of the math covered by the two AoPS volumes and how the topics connect.',
		},
		{
			title: 'Learn number theory',
			detail: 'Patterns, primes and remainders',
			message:
				'I want to learn number theory. Help me work out what I already know and where to begin.',
		},
	];
	async function restorePending() {
		if (!session) return;
		const id = session.id;
		try {
			// Legacy import only. New turns use the existing Pi-backed server state.
			const key = `kane-math-pending:${id}`;
			const raw = localStorage.getItem(key);
			if (!raw) return;
			const old = JSON.parse(raw);
			const saved = await api(`/api/math/sessions/${id}`, {
				action: 'import-pending',
				requestId: old.id,
				message: old.message,
			});
			if (session?.id === id) session = saved;
			if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
		} catch {
			notice =
				'An old browser request could not be imported. Its original has been kept.';
		}
	}
	onMount(() => {
		void restorePending();
		if (session?.messages.length || session?.pending) void scroll();
	});
	async function scroll() {
		await tick();
		bottom?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}
	async function api(path: string, body?: unknown) {
		const response = await fetch(
			path,
			body === undefined
				? {}
				: {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					},
		);
		const result = await response.json();
		if (!response.ok) throw new Error(result.message ?? 'Please try again.');
		return result;
	}
	async function newChat() {
		if (busy) return;
		busy = true;
		try {
			session = await api('/api/math/sessions', {});
			sessions = [
				{
					id: session!.id,
					title: session!.title,
					updatedAt: session!.updatedAt,
				},
				...sessions,
			];
			notice = '';
			draft = '';
			await goto(`/math?session=${session!.id}`, {
				replace: true,
				shallow: true,
				reset: false,
			});
		} catch (e) {
			notice = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function selectChat(id: string) {
		if (busy) return;
		try {
			session = await api(`/api/math/sessions/${id}`);
			await restorePending();
			draft = '';
			notice = '';
			await goto(`/math?session=${id}`, {
				replace: true,
				shallow: true,
				reset: false,
			});
			await scroll();
		} catch (e) {
			notice = (e as Error).message;
		}
	}
	async function editPending() {
		if (busy || !session?.pending) return;
		busy = true;
		const pending = session.pending;
		const id = session.id;
		try {
			session = await api(`/api/math/sessions/${id}`, {
				action: 'discard',
				requestId: pending.id,
			});
			draft = pending.message;
			notice = '';
		} catch (e) {
			notice = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function selectProvider(id: string) {
		try {
			const settings = await api('/api/ai/settings', {
				action: 'select',
				id: id || null,
			});
			connection = settings.defaultProviderId ?? '';
			configured = !!settings.providers.find(
				(p: any) => p.id === settings.defaultProviderId,
			)?.connected;
		} catch (e) {
			notice = (e as Error).message;
		}
	}
	async function send(text = draft) {
		if (busy || !configured) return;
		const message = text.trim();
		if (!message) return;
		notice = '';
		if (!session) {
			await newChat();
			if (!session) return;
		}
		const pending = session.pending ?? { id: crypto.randomUUID(), message };
		session = { ...session, pending };
		const id = session.id;
		busy = true;
		progress = null;
		activeReply = new AbortController();
		draft = '';
		void scroll();
		try {
			const response = await fetch(`/api/math/chat/${id}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/x-ndjson',
				},
				body: JSON.stringify({
					requestId: pending.id,
					message: pending.message,
				}),
				signal: activeReply.signal,
			});
			session = await readStudyStream<MathSession>(response, (event) => {
				progress = event;
				void scroll();
			});
			sessions = [
				{
					id: session!.id,
					title: session!.title,
					updatedAt: session!.updatedAt,
				},
				...sessions.filter((s) => s.id !== id),
			];
		} catch (e) {
			notice = (e as Error).message;
		} finally {
			busy = false;
			progress = null;
			activeReply = undefined;
			void scroll();
		}
	}
</script>

<svelte:head
	><title>Math · Mr. Kane</title><meta
		name="description"
		content="Study math through conversation. Explore AoPS and Irish Mathematical Olympiad papers, find your starting point, and build a plan that grows with you."
	/></svelte:head
>
<div class="math-shell">
	<aside class="math-sidebar">
		<Brand companion="Your learning companion" />
		<Button variant="ghost" href="/" class="justify-start"
			><ArrowLeft class="size-4" /> Learning space</Button
		>
		<div class="math-current">
			<Calculator class="size-4" /> Math <span>AoPS · IrMO</span>
		</div>
		<Button variant="outline" onclick={newChat} disabled={busy} class="w-full"
			><Plus class="size-4" /> New conversation</Button
		>
		<p class="sidebar-label">YOUR CONVERSATIONS</p>
		<nav aria-label="Math conversations" class="math-conversations">
			{#each sessions as item}<button
					class:chosen={session?.id === item.id}
					disabled={busy}
					onclick={() => selectChat(item.id)}
					><BookOpen class="size-4" /><span>{item.title}</span></button
				>{/each}
			{#if !sessions.length}<p class="empty-conversations">
					Your conversations will appear here.
				</p>{/if}
		</nav>
		<div class="sidebar-footer">
			<Sparkles class="size-4" />
			<p>Small discoveries.<br />Lasting understanding.</p>
			<small>A LITTLE CURIOSITY, EVERY DAY.</small>
		</div>
	</aside>
	<main class="math-main">
		<header class="math-header">
			<div>
				<span class="eyebrow">YOUR MATH SPACE</span>
				<h1>Math</h1>
			</div>
			<div class="math-connection">
				<Button
					variant="outline"
					aria-expanded={showLibrary}
					onclick={() => (showLibrary = !showLibrary)}
					><BookOpen class="size-4" /> IrMO papers</Button
				>
				<span class:connected={configured}
					>{configured ? 'Coach connected' : 'Connect your coach'}</span
				><NativeSelect
					aria-label="Math AI connection"
					value={connection}
					onchange={(e) => selectProvider(e.currentTarget.value)}
					disabled={busy}
					><option value="">Choose an AI connection</option
					>{#each data.aiSettings.providers as provider}<option
							value={provider.id}
							disabled={!provider.connected}
							>{provider.name} · {provider.modelId}</option
						>{/each}</NativeSelect
				><a href="/?tab=providers">Settings</a>
				<Button
					variant="ghost"
					class="profile-toggle"
					aria-expanded={showProfile}
					onclick={() => (showProfile = !showProfile)}
					><UserRound class="size-4" /> Your starting point</Button
				>
			</div>
		</header>
		<div class="math-workspace">
			<section class="chat-column" aria-label="Math study chat">
				<!-- Browsing preserves the current conversation and any unfinished turn. -->
				{#if showLibrary}
					<IrmoLibrary
						library={data.irmo}
						disabled={busy || !!session?.pending || !configured}
						onStudy={studyIrmo}
						onClose={() => (showLibrary = false)}
					/>
				{:else}
					<div class="math-transcript" aria-live="polite" aria-busy={busy}>
						{#if !session?.messages.length}
							<div class="math-welcome">
								<div class="welcome-mark"><Calculator size={28} /></div>
								<span class="eyebrow">AOPS · IRISH MATHEMATICAL OLYMPIAD</span>
								<h2>Let’s make math<br />make sense.</h2>
								<p>
									Bring a question, explore an idea, or find a place to begin.
									We’ll get to know what you know and build from there.
								</p>
							</div>
							<button class="irmo-welcome" onclick={() => (showLibrary = true)}
								><BookOpen class="size-4" /><span
									><strong>Explore IrMO Round 2</strong><small
										>Past papers · Proof practice · AoPS preparation</small
									></span
								><ArrowUp class="size-4" /></button
							>
							<div class="math-starters">
								{#each starters as starter}<button
										disabled={busy || !configured || !!session?.pending}
										onclick={() => send(starter.message)}
										><span>{starter.title}<ArrowUp class="size-4" /></span
										><small>{starter.detail}</small></button
									>{/each}
							</div>
							{#if !configured}<div class="math-setup">
									<BookOpen class="size-5" />
									<div>
										<strong>Your books are ready.</strong>
										<p>
											Choose a connected model above, or add one in <a
												href="/?tab=providers">Settings</a
											>, to start a conversation.
										</p>
									</div>
								</div>{/if}
						{/if}
						{#each session?.messages ?? [] as message, index}<article
								class="math-message"
								class:student={message.role === 'user'}
							>
								<span class="message-avatar"
									><ChatAvatar role={message.role} /></span
								>
								<div>
									<span class="message-author"
										>{message.role === 'assistant' ? 'Mr. Kane' : 'You'}</span
									>
									<div class="math-prose">
										{@html renderMathMarkdown(message.content)}
									</div>
								</div>
							</article>{/each}
						{#if session?.pending}<article class="math-message student">
								<span class="message-avatar"><ChatAvatar role="user" /></span>
								<div>
									<span class="message-author">You</span>
									<p class="pending-message">{session.pending.message}</p>
								</div>
							</article>{/if}
						{#if busy && progress?.reply}<article class="math-message">
								<span class="message-avatar"><ChatAvatar /></span>
								<div>
									<span class="message-author">Mr. Kane</span>
									<div class="math-prose">
										{@html renderMathMarkdown(progress.reply)}
									</div>
								</div>
							</article>{/if}
						{#if busy}<p class="math-thinking" role="status">
								<Sparkles class="size-4" />
								{progress?.status === 'reading'
									? 'Reading the source material…'
									: progress?.reply
										? 'Writing your reply…'
										: 'Thinking it through…'}
							</p>{/if}
						{#if notice || (session?.pending && !busy)}<div
								class="math-notice"
								role="alert"
							>
								<p>
									{notice ||
										'This message has not finished yet. Retry it to continue, or edit it first.'}
								</p>
								{#if session?.pending}<Button
										variant="outline"
										onclick={() => send(session!.pending!.message)}
										disabled={busy || !configured}
										><RefreshCw class="size-4" /> Retry message</Button
									><Button variant="ghost" onclick={editPending} disabled={busy}
										>Edit message</Button
									>{/if}
							</div>{/if}
						<div bind:this={bottom}></div>
					</div>
					<form
						class="math-composer"
						onsubmit={(e) => {
							e.preventDefault();
							void send();
						}}
					>
						<label for="math-message">What would you like to work on?</label>
						<div>
							<Textarea
								id="math-message"
								bind:value={draft}
								maxlength={6000}
								rows={2}
								placeholder="Ask a question, share what you’ve tried, or tell me about your goals…"
								disabled={busy || !!session?.pending || !configured}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
										e.preventDefault();
										void send();
									}
								}}
							/><Button
								type="submit"
								aria-label="Send math message"
								disabled={busy ||
									!!session?.pending ||
									!draft.trim() ||
									!configured}><ArrowUp class="size-5" /></Button
							>
						</div>
						<small
							>Enter to send · Shift + Enter for a new line · Saved in your Math
							conversations.</small
						>
					</form>
				{/if}
			</section>
			<aside
				class="learner-panel"
				class:profile-open={showProfile}
				aria-label="Your math learning profile"
			>
				<Button
					variant="ghost"
					class="profile-toggle"
					onclick={() => (showProfile = false)}>Close profile</Button
				>
				<div class="learner-title">
					<UserRound class="size-4" />
					<h2>Your starting point</h2>
				</div>
				<p class="learner-intro">
					A picture that grows as we learn together. You can correct it in the
					chat at any time.
				</p>
				{#if session?.learner.background || session?.learner.goal}<dl>
						{#if session.learner.background}<dt>Background</dt>
							<dd>
								{session.learner.background}
							</dd>{/if}{#if session.learner.goal}<dt>Working toward</dt>
							<dd>
								{session.learner.goal}
							</dd>{/if}{#if session.learner.weeklyTime}<dt>Study time</dt>
							<dd>{session.learner.weeklyTime}</dd>{/if}
					</dl>{:else}<div class="learner-empty">
						<span>01</span>
						<p>Share where you are now.</p>
						<span>02</span>
						<p>Explore a few ideas together.</p>
						<span>03</span>
						<p>Find your next step.</p>
					</div>{/if}
				{#each [{ title: 'What you’ve studied', items: session?.learner.reportedKnowledge ?? [] }, { title: 'Strengths shown so far', items: session?.learner.strengths ?? [] }, { title: 'Ideas to work on', items: session?.learner.gaps ?? [] }] as group}{#if group.items.length}<h3
						>
							{group.title}
						</h3>
						<ul>
							{#each group.items as item}<li>{item}</li>{/each}
						</ul>{/if}{/each}
				<div class="math-library-note">
					<BookOpen class="size-4" /><strong>Your study library</strong>
					<p>
						AoPS Volume 1 · The Basics<br />AoPS Volume 2 · And Beyond<br />IrMO
						finals · 2011–2026
					</p>
					<small
						>Algebra · Number theory · Geometry<br />Counting · Probability ·
						Proof</small
					>
				</div>
			</aside>
		</div>
	</main>
</div>

<style>
	.irmo-welcome {
		display: flex;
		align-items: center;
		gap: 14px;
		max-width: 620px;
		width: 100%;
		margin: 0 auto 18px;
		padding: 16px 20px;
		border: 1px solid var(--border);
		border-radius: 10px;
		text-align: left;
		background: var(--library-surface);
		cursor: pointer;
		color: var(--library-foreground);
	}
	.irmo-welcome span {
		flex: 1;
	}
	.irmo-welcome strong {
		font-size: 13px;
	}
	.irmo-welcome small {
		display: block;
		font-size: 11px;
		margin-top: 5px;
		color: var(--muted-foreground);
	}
	.math-shell {
		display: grid;
		grid-template-columns: 244px minmax(0, 1fr);
		min-height: 100dvh;
		background: var(--background);
	}
	.math-sidebar {
		padding: 28px 20px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--border);
		gap: 18px;
		background: var(--math-sidebar);
		position: sticky;
		top: 0;
		height: 100dvh;
	}
	.math-current {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--math-selected);
		box-shadow: inset 0 0 0 2px var(--border);
		border-radius: 8px;
		padding: 12px;
		font-weight: 600;
	}
	.math-current span {
		margin-left: auto;
		font-size: 10px;
		letter-spacing: 1px;
	}
	.sidebar-label,
	.eyebrow {
		font-size: 10px;
		letter-spacing: 1.8px;
		color: var(--math-label);
		font-weight: 600;
	}
	.sidebar-label {
		margin: 12px 0 0;
	}
	.math-conversations {
		overflow: auto;
		flex: 1;
		min-height: 100px;
	}
	.math-conversations button {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 12px 10px;
		width: 100%;
		text-align: left;
		border: 0;
		border-radius: 7px;
		background: transparent;
		font-size: 12px;
		color: var(--math-conversations-button-foreground);
		cursor: pointer;
		margin-bottom: 4px;
	}
	.math-conversations button span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.math-conversations button.chosen {
		background: var(--math-selected);
		box-shadow: inset 0 0 0 2px var(--border);
		color: var(--primary);
	}
	.empty-conversations {
		font-size: 12px;
		color: var(--math-muted-foreground);
		padding: 8px;
	}
	.sidebar-footer {
		border-top: 1px solid var(--border);
		padding: 22px 8px 0;
	}
	.sidebar-footer p {
		font-family: var(--font-heading);
		font-size: 17px;
		line-height: 1.5;
	}
	.sidebar-footer small {
		font-size: 8px;
		letter-spacing: 1.3px;
		color: var(--math-muted-foreground);
	}
	.math-main {
		min-width: 0;
	}
	.math-header {
		height: 100px;
		padding: 20px 38px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		border-bottom: 1px solid var(--border);
	}
	.math-header h1 {
		font-family: var(--font-heading);
		font-size: 28px;
		margin: 2px 0;
	}
	.math-connection {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
	}
	.math-connection > span {
		color: var(--math-connection-span-foreground);
	}
	.math-connection > span.connected {
		color: var(--math-connection-span-connected-foreground);
	}
	.math-connection :global(select) {
		max-width: 230px;
		font-size: 12px;
	}
	.math-connection a {
		white-space: nowrap;
	}
	.math-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 270px;
		min-height: calc(100dvh - 100px);
	}
	.chat-column {
		min-width: 0;
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - 100px);
	}
	.math-transcript {
		flex: 1;
		overflow: auto;
		padding: 36px max(24px, calc((100% - 740px) / 2));
		scroll-behavior: smooth;
	}
	.math-welcome {
		text-align: center;
		max-width: 510px;
		margin: 10px auto 30px;
	}
	.welcome-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		background: var(--welcome-mark-background);
		border-radius: 18px;
		margin: 0 auto 24px;
	}
	.math-welcome h2 {
		font-family: var(--font-heading);
		font-size: clamp(36px, 4vw, 52px);
		line-height: 1.12;
		font-weight: 400;
		letter-spacing: -1.5px;
		margin: 16px 0;
	}
	.math-welcome p {
		font-size: 14px;
		line-height: 1.8;
		color: var(--math-description);
		max-width: 420px;
		margin: 0 auto;
	}
	.math-starters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		max-width: 600px;
		margin: 24px auto;
	}
	.math-starters button {
		text-align: left;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 18px;
		cursor: pointer;
	}
	.math-starters button:disabled {
		cursor: default;
		opacity: 0.65;
	}
	.math-starters button span {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
		font-weight: 600;
	}
	.math-starters button small {
		display: block;
		font-size: 11px;
		color: var(--math-muted-foreground);
		margin-top: 7px;
	}
	.math-setup {
		display: flex;
		gap: 12px;
		background: var(--secondary);
		padding: 16px;
		border-radius: 9px;
		font-size: 12px;
		max-width: 600px;
		margin: 22px auto;
	}
	.math-setup p {
		margin-bottom: 0;
		line-height: 1.6;
	}
	.math-message {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr);
		gap: 14px;
		margin: 4px 0 30px;
	}
	.message-avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.message-author {
		text-transform: uppercase;
		letter-spacing: 1.4px;
		font-size: 9px;
		font-weight: 700;
		color: var(--math-label);
	}
	.pending-message {
		white-space: pre-wrap;
		font-size: 14px;
		line-height: 1.8;
	}
	.math-prose {
		font-size: 14px;
		line-height: 1.85;
		overflow-wrap: anywhere;
	}
	.math-prose :global(p) {
		margin: 8px 0 14px;
	}
	.math-prose :global(h1),
	.math-prose :global(h2),
	.math-prose :global(h3) {
		font-family: var(--font-heading);
		line-height: 1.35;
		margin: 22px 0 10px;
	}
	.math-prose :global(ul),
	.math-prose :global(ol) {
		padding-left: 24px;
		list-style: revert;
	}
	.math-prose :global(img) {
		max-width: 100%;
		max-height: 560px;
		object-fit: contain;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.math-prose :global(.katex-display) {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 6px 0;
	}
	.math-prose :global(pre) {
		overflow: auto;
		background: var(--secondary);
		padding: 14px;
		border-radius: 8px;
	}
	.math-prose :global(a) {
		text-decoration: underline;
	}
	.math-prose :global(table) {
		display: block;
		overflow: auto;
		border-collapse: collapse;
	}
	.math-prose :global(td),
	.math-prose :global(th) {
		padding: 6px 10px;
		border: 1px solid var(--border);
	}
	.math-composer {
		border-top: 1px solid var(--border);
		padding: 18px 28px 20px;
		background: var(--background);
	}
	.math-composer label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.math-composer > div {
		display: flex;
		align-items: flex-end;
		gap: 10px;
	}
	.math-composer :global(textarea) {
		resize: vertical;
		min-height: 64px;
		max-height: 160px;
		background: var(--card);
	}
	.math-composer small {
		display: block;
		color: var(--math-muted-foreground);
		font-size: 9px;
		margin-top: 10px;
		line-height: 1.5;
	}
	.learner-panel {
		border-left: 1px solid var(--border);
		padding: 30px 24px;
		background: var(--learner-panel-background);
	}
	.learner-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.learner-title h2 {
		font-size: 13px;
		font-weight: 600;
	}
	.learner-intro {
		font-size: 11px;
		color: var(--math-muted-foreground);
		line-height: 1.8;
		margin: 14px 0 26px;
	}
	.learner-empty {
		display: grid;
		grid-template-columns: 24px 1fr;
		gap: 16px 10px;
		align-items: center;
		font-size: 11px;
		color: var(--math-description);
		margin-bottom: 35px;
	}
	.learner-empty span {
		font-family: var(--font-heading);
		font-size: 18px;
		color: var(--learner-empty-span-foreground);
	}
	.learner-empty p {
		margin: 0;
	}
	.learner-panel dt,
	.learner-panel h3 {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: var(--math-description);
		margin: 22px 0 7px;
	}
	.learner-panel dd,
	.learner-panel li {
		font-size: 12px;
		line-height: 1.8;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.learner-panel ul {
		padding-left: 15px;
		list-style: disc;
	}
	.math-library-note {
		border-top: 1px solid var(--border);
		padding-top: 24px;
		margin-top: 30px;
	}
	.math-library-note strong {
		display: block;
		font-size: 12px;
		margin: 10px 0;
	}
	.math-library-note p {
		font-size: 11px;
		line-height: 1.9;
	}
	.math-library-note small {
		font-size: 10px;
		line-height: 1.9;
		color: var(--math-muted-foreground);
	}
	.math-thinking {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: var(--math-label);
	}
	.math-notice {
		padding: 16px;
		background: var(--math-notice-background);
		border-radius: 8px;
		font-size: 12px;
		margin-bottom: 16px;
	}
	:global(.profile-toggle) {
		display: none;
	}
	@media (min-width: 1500px) {
		.math-workspace {
			grid-template-columns: minmax(0, 1fr) 310px;
		}
	}
	@media (max-width: 1100px) {
		:global(.profile-toggle) {
			display: inline-flex;
		}
		.learner-panel.profile-open {
			display: block;
			position: fixed;
			right: 0;
			top: 100px;
			bottom: 0;
			width: min(320px, 90vw);
			z-index: 20;
			overflow: auto;
			box-shadow: -10px 0 30px var(--math-panel-shadow);
		}
		.learner-panel {
			display: none;
		}
		.math-workspace {
			grid-template-columns: 1fr;
		}
		.math-connection > span {
			display: none;
		}
		.math-header {
			padding: 20px 24px;
		}
	}
	@media (max-width: 700px) {
		.math-shell {
			grid-template-columns: 1fr;
		}
		.math-sidebar {
			position: static;
			height: auto;
			padding: 12px 18px;
			flex-direction: row;
			align-items: center;
			flex-wrap: wrap;
			gap: 8px;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
		.math-current,
		.sidebar-label,
		.sidebar-footer {
			display: none;
		}
		.math-sidebar > .math-conversations {
			flex-basis: 100%;
			display: flex;
			gap: 6px;
			min-height: 0;
			max-height: 45px;
		}
		.math-conversations button {
			width: auto;
			max-width: 200px;
			flex-shrink: 0;
			padding: 8px;
			font-size: 11px;
		}
		.math-header {
			height: auto;
			min-height: 90px;
			padding: 16px 20px;
			align-items: flex-start;
		}
		.math-connection {
			flex-direction: column;
			align-items: flex-end;
			gap: 6px;
		}
		.math-connection :global(select) {
			max-width: 170px;
		}
		.chat-column {
			max-height: none;
			min-height: calc(100dvh - 190px);
		}
		.math-transcript {
			padding: 24px 20px;
			overflow: visible;
		}
		.math-welcome {
			margin-top: 0;
		}
		.math-welcome h2 {
			font-size: 38px;
		}
		.math-starters {
			gap: 8px;
		}
		.math-starters button {
			padding: 14px;
		}
		.math-composer {
			position: sticky;
			bottom: 0;
			padding: 14px 18px;
		}
		.math-message {
			gap: 10px;
		}
		.math-starters button small {
			line-height: 1.5;
		}
	}
</style>
