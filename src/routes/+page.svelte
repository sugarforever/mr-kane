<script lang="ts">
	import { languages } from '$lib/languages';
	import type { Language } from '$lib/languages';
	import * as Icons from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	import { onMount, type Component } from 'svelte';
	import {
		Compass,
		PenLine,
		Mic,
		BookOpen,
		Settings,
		History,
	} from '@lucide/svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import Recorder from '#lib/Recorder.svelte';
	import ReadingText from '$lib/ReadingText.svelte';
	import { readingUnits, type ReadingUnit } from '$lib/reading-levels';
	import Vocabulary from '$lib/Vocabulary.svelte';
	import AIProviders from '#lib/AIProviders.svelte';
	import type { AISettings } from '#lib/ai-types';
	import {
		defaultProfile,
		legacyAgeGroup,
		profileSchema,
		requestSchema,
		practiceSchema,
		feedbackSchema,
		restoreNotebook,
		addAttempt,
		languageNames,
		type Profile,
		type Practice,
		type Attempt,
		type Notebook,
	} from '#lib/domain';
	import { demoPractice } from '#lib/demo';
	let { data } = $props();
	type Tab =
		| 'today'
		| 'writing'
		| 'speaking'
		| 'review'
		| 'profile'
		| 'providers'
		| 'vocabulary';
	let aiOverride: AISettings | null = $state(null);
	const aiSettings = $derived(aiOverride ?? data.aiSettings);
	const aiConfigured = $derived(
		!!aiSettings.providers.find((p) => p.id === aiSettings.defaultProviderId)
			?.connected,
	);
	async function selectAI(id: string) {
		try {
			const response = await fetch('/api/ai/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'select', id: id || null }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			aiOverride = result;
		} catch {
			notice = 'Could not change the AI connection. Please retry.';
		}
	}
	const navs: { id: Tab; icon: Component; label: string }[] = [
		{ id: 'today', icon: Compass, label: 'Today' },
		{ id: 'writing', icon: PenLine, label: 'Writing studio' },
		{ id: 'speaking', icon: Mic, label: 'Reading room' },
		{ id: 'review', icon: BookOpen, label: 'Review notes' },
		{ id: 'vocabulary', icon: BookOpen, label: 'Vocabulary' },
		{ id: 'providers', icon: Settings, label: 'AI Providers' },
	];
	type PendingAI = {
		id: string;
		path: string;
		body: unknown;
		attemptId?: string;
	};
	let pendingAI: PendingAI | null = $state(null);
	function clearPending() {
		localStorage.removeItem('mr-kane-pending-ai');
		pendingAI = null;
	}
	async function sendAI(p: PendingAI) {
		const response = await fetch(p.path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-request-id': p.id },
			body: JSON.stringify(p.body),
		});
		const result = await response.json();
		if (!response.ok) {
			if (response.status < 500) clearPending();
			throw new Error(result.message ?? 'The request did not finish.');
		}
		return result;
	}
	async function resumeAI() {
		if (!pendingAI) return;
		busy = true;
		try {
			const p = pendingAI;
			const result = await sendAI(p);
			if (p.path === '/api/practice') {
				const practice = practiceSchema.parse(result);
				save({
					...notebook,
					practices: [
						practice,
						...notebook.practices.filter((x) => x.id !== practice.id),
					],
				});
				profile = profiles[practice.profile.language] ?? practice.profile;
				choose(practice);
				tab = practice.mode;
			} else {
				const feedback = feedbackSchema.parse(result);
				if (!notebook.attempts.some((a) => a.id === p.attemptId))
					throw new Error('The saved writing version could not be found.');
				save({
					...notebook,
					attempts: notebook.attempts.map((a) =>
						a.id === p.attemptId ? { ...a, feedback } : a,
					),
				});
				tab = 'review';
			}
			clearPending();
			notice = 'Your AI result has been recovered and saved.';
		} catch (e) {
			notice =
				e instanceof Error ? e.message : 'Could not recover this request.';
		} finally {
			busy = false;
		}
	}
	let tab: Tab = $state('today');
	let profile: Profile = $state({ ...defaultProfile });
	let profiles: Partial<Record<Language, Profile>> = {};
	let notebook: Notebook = $state({
		version: 1,
		attempts: [],
		practices: [],
		reviews: {},
	});
	let ready = $state(false);
	let storageBroken = $state(false);
	let selectedId = $state('');
	let draft = $state('');
	let notice = $state('');
	let busy = $state(false);
	let micBusy = $state(false);
	let sourceType: 'daily' | 'science' | 'nature' | 'news' | 'exam' =
		$state('daily');
	let material = $state('');
	let useResearch = $state(true);
	let mode: 'writing' | 'speaking' = $state('writing');
	let readingUnit = $state<ReadingUnit>('words');
	let showHistory = $state(false);
	const current = $derived(
		notebook.practices.find(
			(p) => p.id === selectedId && p.profile.language === profile.language,
		) ?? null,
	);
	const attempts = $derived(
		notebook.attempts.filter(
			(a) => a.practice.profile.language === profile.language,
		),
	);
	const latest = $derived(
		current
			? attempts.find(
					(a) =>
						a.practice.id === current.id &&
						a.text === draft.trim() &&
						a.feedback,
				)
			: undefined,
	);
	const reviewPoints = $derived(
		attempts.flatMap((a) =>
			(a.feedback?.points ?? []).map((point, i) => ({
				point,
				attempt: a,
				key: `${a.id}:${i}`,
			})),
		),
	);
	const remaining = $derived(
		reviewPoints.filter((p) => !notebook.reviews[p.key]).length,
	);
	onMount(() => {
		if (new URLSearchParams(location.search).get('tab') === 'providers')
			tab = 'providers';
		try {
			notebook = restoreNotebook(localStorage.getItem('mr-kane-notebook'));
			const pendingRaw = localStorage.getItem('mr-kane-pending-ai');
			if (pendingRaw) {
				const p = JSON.parse(pendingRaw);
				if (
					typeof p.id === 'string' &&
					['/api/practice', '/api/feedback'].includes(p.path) &&
					p.body
				)
					pendingAI = p;
			}
			notebook.practices = notebook.practices.map((p) => {
				if (p.origin !== 'demo' || !/[\u4e00-\u9fff]/.test(p.title)) return p;
				if (p.title.includes('\u6211\u7684\u5199\u4f5c'))
					return {
						...p,
						title: 'My writing',
						origin: 'user',
						sourceNote: 'From your own writing.',
					};
				return {
					...p,
					...demoPractice({
						profile: p.profile,
						mode: p.mode,
						sourceType: p.title.includes('\u690d\u7269') ? 'science' : 'daily',
						material: '',
						research: false,
					}),
				};
			});
			const raw = localStorage.getItem('mr-kane-profiles');
			if (raw) {
				const saved = JSON.parse(raw);
				for (const lang of languages.map((entry) => entry.value)) {
					if (saved[lang])
						profiles[lang] = profileSchema.parse({
							...saved[lang],
							ageGroup: legacyAgeGroup(saved[lang].ageGroup),
						});
				}
				profile = profiles.es ?? { ...defaultProfile };
				if (
					profile.interests ===
					'\u81ea\u7136\u3001\u8fd0\u52a8\u3001\u8eab\u8fb9\u7684\u751f\u6d3b'
				)
					profile.interests = defaultProfile.interests;
			}
			selectedId =
				notebook.practices.find((p) => p.profile.language === profile.language)
					?.id ?? '';
			loadDraft();
		} catch {
			storageBroken = true;
			notice =
				'Local records could not be read. Saving is paused to protect your data. Export a backup before checking browser storage.';
		} finally {
			ready = true;
		}
	});
	function save(next: Notebook) {
		if (storageBroken)
			throw new Error(
				'Saving is paused because local records could not be read.',
			);
		localStorage.setItem('mr-kane-notebook', JSON.stringify(next));
		notebook = next;
	}
	function saveProfile() {
		try {
			profiles[profile.language] = $state.snapshot(profile);
			localStorage.setItem('mr-kane-profiles', JSON.stringify(profiles));
			notice = 'Profile saved. Your next practice will use these preferences.';
		} catch {
			notice = 'Your profile could not be saved. Check browser storage.';
		}
	}
	function changeLanguage(language: Language) {
		profile = profiles[language] ?? { ...defaultProfile, language };
		selectedId =
			notebook.practices.find((p) => p.profile.language === language)?.id ?? '';
		loadDraft();
		notice = '';
	}
	function loadDraft() {
		draft = selectedId
			? (localStorage.getItem(`mr-kane-draft:${selectedId}`) ?? '')
			: '';
	}
	function edit(value: string) {
		draft = value;
		try {
			localStorage.setItem(`mr-kane-draft:${selectedId}`, value);
		} catch {
			notice = 'Autosave failed. Copy your writing somewhere safe.';
		}
	}
	function choose(p: Practice) {
		selectedId = p.id;
		loadDraft();
		notice = '';
	}
	function navigate(next: Tab) {
		if (micBusy || busy) return;
		tab = next;
		if (next === 'writing' || next === 'speaking') {
			const p = notebook.practices.find(
				(p) => p.profile.language === profile.language && p.mode === next,
			);
			if (p) choose(p);
		}
	}
	async function api(path: string, body: unknown, attemptId?: string) {
		if (pendingAI)
			throw new Error('Resume or dismiss the unfinished AI request first.');
		const pending = { id: crypto.randomUUID(), path, body, attemptId };
		localStorage.setItem('mr-kane-pending-ai', JSON.stringify(pending));
		pendingAI = pending;
		return sendAI(pending);
	}

	async function generateVocabulary(
		words: string[],
		practiceMode: 'writing' | 'speaking',
		unit?: ReadingUnit,
	) {
		if (busy || micBusy || !aiConfigured || storageBroken) return;
		await generate({ words, mode: practiceMode, unit });
	}
	async function generate(vocabulary?: {
		words: string[];
		mode: 'writing' | 'speaking';
		unit?: ReadingUnit;
	}) {
		notice = '';
		const parsed = requestSchema.safeParse({
			profile: $state.snapshot(profile),
			mode: vocabulary?.mode ?? mode,
			sourceType: vocabulary ? 'daily' : sourceType,
			material: vocabulary ? '' : material,
			research: vocabulary ? false : useResearch,
			...((vocabulary?.mode ?? mode) === 'speaking'
				? { readingUnit: vocabulary?.unit ?? readingUnit }
				: {}),
			...(vocabulary ? { selectedVocabulary: vocabulary.words } : {}),
		});
		if (!parsed.success) {
			notice = parsed.error.issues[0].message;
			return;
		}
		busy = true;
		try {
			saveProfile();
			const result = practiceSchema.parse(
				await api('/api/practice', parsed.data),
			);
			save({
				...notebook,
				practices: [
					result,
					...notebook.practices.filter((p) => p.id !== result.id),
				],
			});
			clearPending();
			choose(result);
			tab = result.mode;
			notice =
				result.origin === 'demo'
					? 'A fixed sample is ready. Connect a model for practice tailored to your interests, level, and source material.'
					: 'Your new practice is saved.';
		} catch (e) {
			notice =
				e instanceof Error
					? e.message
					: 'Could not prepare your practice. Please try again.';
		} finally {
			busy = false;
		}
	}
	function makeAttempt(): Attempt {
		if (!current || !draft.trim()) throw new Error('Write something first.');
		return {
			id: crypto.randomUUID(),
			practice: $state.snapshot(current),
			text: draft.trim(),
			feedback: null,
			createdAt: new Date().toISOString(),
		};
	}
	function archive() {
		try {
			const a = makeAttempt();
			save({ ...notebook, attempts: addAttempt(notebook.attempts, a) });
			notice = 'This version is saved. Keep exploring your ideas.';
		} catch (e) {
			notice =
				e instanceof Error ? e.message : 'Your writing could not be saved.';
		}
	}
	async function feedback() {
		if (!current) return;
		busy = true;
		try {
			const a = makeAttempt();
			save({ ...notebook, attempts: addAttempt(notebook.attempts, a) });
			const result = feedbackSchema.parse(
				await api(
					'/api/feedback',
					{ practice: a.practice, text: a.text },
					a.id,
				),
			);
			save({
				...notebook,
				attempts: notebook.attempts.map((x) =>
					x.id === a.id ? { ...x, feedback: result } : x,
				),
			});
			clearPending();
			notice =
				'Feedback saved. Start with a hint and try making your own revision.';
		} catch (e) {
			notice =
				e instanceof Error
					? e.message
					: 'Feedback did not finish. Your writing has been kept.';
		} finally {
			busy = false;
		}
	}
	function toggleReview(key: string) {
		try {
			save({
				...notebook,
				reviews: { ...notebook.reviews, [key]: !notebook.reviews[key] },
			});
		} catch {
			notice = 'Your review status could not be saved.';
		}
	}
	function useWriting() {
		if (!current || !draft.trim()) return;
		try {
			const p: Practice = {
				...$state.snapshot(current),
				id: crypto.randomUUID(),
				mode: 'speaking',
				origin: 'user',
				sourceNote: 'From your own writing. Saved as a reading script.',
				title: `${current.title} · My writing`,
				script: draft.trim(),
				createdAt: new Date().toISOString(),
			};
			save({ ...notebook, practices: [p, ...notebook.practices] });
			choose(p);
			tab = 'speaking';
		} catch {
			notice = 'The reading script could not be saved. Please try again.';
		}
	}
	function exportData() {
		try {
			const blob = new Blob(
				[
					JSON.stringify(
						{
							notebook: localStorage.getItem('mr-kane-notebook'),
							vocabulary: localStorage.getItem('mr-kane-vocabulary'),
							profiles: localStorage.getItem('mr-kane-profiles'),
							drafts: Object.fromEntries(
								Object.keys(localStorage)
									.filter((k) => k.startsWith('mr-kane-draft:'))
									.map((k) => [k, localStorage.getItem(k)]),
							),
						},
						null,
						2,
					),
				],
				{ type: 'application/json' },
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'mr-kane-backup.json';
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			notice =
				'Text backup exported. Download your audio separately in the Reading room.';
		} catch {
			notice = 'Export failed. Check your browser download permission.';
		}
	}
</script>

<svelte:head
	><title>Mr. Kane · Bring language to life</title><meta
		name="description"
		content="Start with your world. Write a little, read it aloud, and keep a record of your progress."
	/></svelte:head
>
<div class="app-shell">
	<aside class="sidebar">
		<a class="brand" href="/" aria-label="Mr. Kane home"
			><span class="brand-mark">k<span>·</span></span>
			<div>mr. kane<small>YOUR LANGUAGE COMPANION</small></div></a
		>
		<div class="sidebar-caption">MY LEARNING SPACE</div>
		<nav aria-label="Main navigation">
			<Button variant="ghost" href="/math" disabled={micBusy || busy}
				><span class="nav-icon"><Icons.Calculator class="size-4" /></span
				>Math</Button
			>
			{#each navs as n}<Button
					variant="ghost"
					data-active={tab === n.id}
					onclick={() => navigate(n.id)}
					disabled={micBusy || busy}
					><span class="nav-icon"><n.icon class="size-4" /></span
					>{n.label}{#if n.id === 'review' && remaining}<Badge class="count"
							>{remaining}</Badge
						>{/if}</Button
				>{/each}
			<Button
				variant="ghost"
				class="history-link"
				href="/reading-history"
				disabled={micBusy || busy}
				><span class="nav-icon"><History class="size-4" /></span>Reading history</Button
			>
		</nav>
		<Separator class="mt-6" />
		<div class="sidebar-note">
			<span class="little-spark">✳</span>
			<p>Language lives beyond books.<br />Find it in your everyday life.</p>
			<small>A LITTLE PRACTICE, EVERY DAY.</small>
		</div>
		<Button
			variant="ghost"
			class="profile-link h-auto whitespace-normal text-left justify-start gap-2"
			data-active={tab === 'profile'}
			onclick={() => navigate('profile')}
			disabled={micBusy || busy}
			><span class="avatar">K</span>
			<div>
				My learning profile<small>{profile.ageGroup} · {profile.level}</small>
			</div>
			<span>↗</span></Button
		>
	</aside>
	<main>
		<header class="topbar">
			<span>A little curiosity goes a long way</span>
			<div class="header-actions">
				<span class="connection" class:live={aiConfigured}
					><i></i>{aiConfigured ? 'AI configured' : 'Demo mode'}</span
				><Label class="ai-selector block"
					><span class="sr-only">AI connection</span><NativeSelect
						class="w-full"
						aria-label="AI connection"
						value={aiSettings.defaultProviderId ?? ''}
						onchange={(e) => selectAI(e.currentTarget.value)}
						disabled={busy || micBusy}
						><option value="">Demo mode</option
						>{#each aiSettings.providers as p}<option
								value={p.id}
								disabled={!p.connected}
								>{p.name} · {p.modelId}{p.connected
									? ''
									: ' · Sign-in required'}</option
							>{/each}</NativeSelect
					></Label
				><Label class="language-select block"
					><span>Learning language</span><NativeSelect
						class="w-full"
						value={profile.language}
						onchange={(e) => changeLanguage(e.currentTarget.value as Language)}
						disabled={!ready || busy || micBusy}
						>{#each languages as language}<option value={language.value}
								>{language.label}</option
							>{/each}</NativeSelect
					></Label
				>
			</div>
		</header>
		<div class="page-content">
			{#if pendingAI}<Alert.Root class="notice recovery-banner" role="status">
					<p>
						{busy
							? 'Your AI request is being processed.'
							: 'An unfinished AI request is saved. Resume it without creating a duplicate task.'}
					</p>
					<Button
						variant="outline"
						class="secondary"
						onclick={resumeAI}
						disabled={busy || storageBroken}
						><Icons.RefreshCw aria-hidden="true" />Resume request</Button
					><Button
						variant="ghost"
						class="text-button"
						onclick={clearPending}
						disabled={busy}
						size="icon"
						title="Dismiss"
						aria-label="Dismiss"><Icons.X aria-hidden="true" /></Button
					>
				</Alert.Root>{/if}
			{#if notice}<Alert.Root class="notice global-notice" role="status">
					{notice}<Button
						variant="ghost"
						class="text-button"
						onclick={() => (notice = '')}
						aria-label="Dismiss message"
						size="icon"
						title="Dismiss message"><Icons.X aria-hidden="true" /></Button
					>
				</Alert.Root>{/if}
			{#if tab === 'providers'}
				<AIProviders onsettings={(value) => (aiOverride = value)} />
			{:else if tab === 'today'}
				<div class="eyebrow">A SMALL STEP, A NEW DISCOVERY</div>
				<div class="page-heading">
					<div>
						<h1>What caught your eye?<span class="sun">✳</span></h1>
						<p>
							Start with what interests you. Make {languageNames[
								profile.language
							]} part of your everyday life.
						</p>
					</div>
					<span class="level-pill">{profile.ageGroup} / {profile.level}</span>
				</div>
				<section class="hero-card">
					<div class="hero-copy">
						<Badge class="chip">YOUR NEXT SMALL DISCOVERY</Badge>
						<h2>Your everyday world.<br />Your own words.</h2>
						<p>
							Notice something. Write about it. Read it aloud.<br />No scores.
							Just a little more confidence.
						</p>
						<a href="#topic-builder">Find your next topic <span>↘</span></a>
					</div>
					<div class="illustration" aria-hidden="true">
						<div class="orbit orbit-one"></div>
						<div class="orbit orbit-two"></div>
						<span class="illus-star">✳</span>
						<div class="paper paper-back"></div>
						<div class="paper">
							<div class="paper-label">MY LITTLE WORLD</div>
							<div class="paper-line"></div>
							<div class="paper-line short"></div>
							<div class="paper-line"></div>
							<div class="paper-line short"></div>
							<div class="paper-doodle">hola<span>!</span></div>
						</div>
						<div class="speech-bubble">dia dhuit!</div>
						<div class="pencil"></div>
					</div>
				</section>
				<div class="section-heading">
					<h2>A little writing. A little speaking.</h2>
					<span>Two ways to find your voice</span>
				</div>
				<div class="path-grid">
					<Button
						variant="outline"
						class="path-card h-auto whitespace-normal justify-start text-left"
						onclick={() => {
							mode = 'writing';
							document
								.getElementById('topic-builder')
								?.scrollIntoView({ behavior: 'smooth' });
						}}
						><span class="path-icon coral">✎</span>
						<div>
							<h3>Writing studio</h3>
							<p>Put your thoughts into words. Make them your own.</p>
							<small>Explore Write Reflect Try again</small>
						</div>
						<span>↗</span></Button
					><Button
						variant="outline"
						class="path-card h-auto whitespace-normal justify-start text-left"
						onclick={() => {
							mode = 'speaking';
							document
								.getElementById('topic-builder')
								?.scrollIntoView({ behavior: 'smooth' });
						}}
						><span class="path-icon green">◉</span>
						<div>
							<h3>Reading room</h3>
							<p>Read a little, record it, and hear your progress.</p>
							<small>Read Record Listen Keep</small>
						</div>
						<span>↗</span></Button
					>
				</div>
				<Card.Root class="builder panel" id="topic-builder">
					<div class="section-heading">
						<div>
							<h2>Follow your curiosity</h2>
							<p>
								What is happening around you? What would you like to explore?
							</p>
						</div>
						<span class="small-label">LET'S EXPLORE</span>
					</div>
					<div class="source-options">
						{#each [{ id: 'daily', icon: Icons.Sun, label: 'Everyday life' }, { id: 'science', icon: Icons.FlaskConical, label: 'Science' }, { id: 'nature', icon: Icons.Leaf, label: 'Nature' }, { id: 'news', icon: Icons.Newspaper, label: 'In the news' }, { id: 'exam', icon: Icons.GraduationCap, label: 'Exam inspiration' }] as s}<Button
								variant="ghost"
								data-active={sourceType === s.id}
								onclick={() => (sourceType = s.id as typeof sourceType)}
								><s.icon aria-hidden="true" />{s.label}</Button
							>{/each}
					</div>
					<Label class=" block"
						>Things I am curious about<Input
							bind:value={profile.interests}
							maxlength={500}
							placeholder="Football, wildlife, music, a recent trip…"
						/></Label
					>
					<Label class=" block"
						>{sourceType === 'news'
							? 'Optional news extract or topic'
							: sourceType === 'exam'
								? 'Optional exam theme or learning objective'
								: 'Optional topic, observation, or source material'}<Textarea
							bind:value={material}
							maxlength={12000}
							rows={4}
							placeholder="Leave this blank and AI will create the material from your interests. Add details if you have a particular topic in mind."
						></Textarea></Label
					>
					<Label class="check flex"
						><Checkbox
							aria-label="Use real web sources"
							checked={useResearch || sourceType === 'news'}
							onCheckedChange={(checked) => (useResearch = checked)}
							disabled={sourceType === 'news'}
						/> Use real web sources</Label
					>
					<p class="fineprint">
						{sourceType === 'news'
							? 'News always searches for dated sources.'
							: 'Search is optional for other scenes.'} Only your interests and scene
						are sent to search. AI adapts the material to your level, vocabulary and
						grammar. Sources are saved with your practice.
					</p>
					{#if mode === 'speaking'}
						<Label class="block my-4"
							>Reading training unit<NativeSelect
								bind:value={readingUnit}
								disabled={busy}
								class="w-full"
								>{#each readingUnits as unit}<option value={unit.value}
										>{unit.label}</option
									>{/each}</NativeSelect
							></Label
						>
						<p class="fineprint">
							{readingUnits.find((unit) => unit.value === readingUnit)
								?.description} This controls the length of your practice. Your A1–B2
							language level controls vocabulary and grammar. New to the language?
							Start with words and A1 in My learning profile.
						</p>
					{/if}
					<div class="builder-footer">
						<Tabs.Root bind:value={mode}
							><Tabs.List aria-label="Practice mode"
								><Tabs.Trigger value="writing">✎ Writing</Tabs.Trigger
								><Tabs.Trigger value="speaking">◉ Reading aloud</Tabs.Trigger
								></Tabs.List
							></Tabs.Root
						>
						<Button
							variant="default"
							class="primary"
							onclick={() => generate()}
							disabled={!ready || busy || storageBroken}
							><Icons.Sparkles aria-hidden="true" />{busy
								? 'Preparing…'
								: aiConfigured
									? 'Make my practice'
									: 'Explore a sample'}</Button
						>
					</div>
					{#if !aiConfigured}<p class="fineprint">
							Demo mode uses fixed samples, not personalised practice. Reading
							samples follow your selected training unit. News, exam topics, and
							writing feedback need a connected AI model.
						</p>{/if}
				</Card.Root>
			{:else if tab === 'writing'}
				<div class="eyebrow">MAKE YOUR THOUGHTS YOUR OWN</div>
				<div class="page-heading">
					<div>
						<h1>Writing studio</h1>
						<p>Get your ideas down. Then find a clearer way to say them.</p>
					</div>
					<Button
						variant="outline"
						class="secondary"
						onclick={() => navigate('today')}
						><Icons.Plus aria-hidden="true" />New topic</Button
					>
				</div>
				{#if current}<div class="workspace-grid">
						<Card.Root class="panel editor-panel">
							<Badge class="chip"
								>{current.profile.level} · {current.origin === 'demo'
									? 'Fixed sample'
									: 'My practice'}</Badge
							>
							<h2>{current.title}</h2>
							<p class="task-prompt">{current.prompt}</p>
							<div class="focus">Your focus · {current.focus}</div>
							<section aria-labelledby="writing-story-heading" class="my-6">
								<h3 id="writing-story-heading">Story and example script</h3>
								<p
									class="whitespace-pre-wrap break-words"
									lang={current.profile.language}
								>
									{current.script}
								</p>
							</section>
							<Label class="editor-label block" for="writing"
								>My writing <span
									>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span
								></Label
							><Textarea
								id="writing"
								class="writing-area"
								lang={profile.language}
								value={draft}
								oninput={(e) => edit(e.currentTarget.value)}
								maxlength={12000}
								placeholder={languages.find(
									(entry) => entry.value === profile.language,
								)?.placeholder}
							></Textarea>
							<div class="spread wrap">
								<span class="fineprint">Draft saved in this browser</span>
								<div class="button-row">
									<Button
										variant="outline"
										class="secondary"
										onclick={archive}
										disabled={busy || !draft.trim() || storageBroken}
										><Icons.Save aria-hidden="true" />Save this version</Button
									><Button
										variant="default"
										class="primary"
										onclick={feedback}
										disabled={busy ||
											!draft.trim() ||
											!aiConfigured ||
											storageBroken}
										><Icons.Sparkles aria-hidden="true" />{busy
											? 'Reading…'
											: 'Get feedback'}</Button
									>
								</div>
							</div>
							{#if !aiConfigured}<p class="fineprint">
									You can write and save in demo mode. Connect an AI model to
									receive feedback.
								</p>{/if}<Button
								variant="ghost"
								class="text-button"
								onclick={useWriting}
								disabled={busy || !draft.trim() || storageBroken}
								><Icons.Volume2 aria-hidden="true" />Read my writing aloud</Button
							>
						</Card.Root>
						<aside class="feedback-column">
							<Card.Root class="panel">
								<div class="section-heading">
									<h3>Words to explore</h3>
									<span>✳</span>
								</div>
								<div class="vocab-list">
									{#each current.vocabulary as v}<span>{v}</span>{/each}
								</div>
								<p class="fineprint">{current.sourceNote}</p>
								{#if current.sources?.length}<Collapsible.Root>
										<Collapsible.Trigger
											>Research sources · {current.sources
												.length}</Collapsible.Trigger
										><Collapsible.Content>
											<p class="fineprint">
												Retrieved {current.searchedAt
													? new Date(current.searchedAt).toLocaleDateString(
															'en-IE',
														)
													: 'for this practice'}. Search excerpts inform this AI
												adaptation; check original sources for full context.
											</p>
											{#each current.sources as source}<p>
													<a href={source.url} target="_blank" rel="noreferrer"
														>{source.title} ↗</a
													>{#if source.publishedAt}<small>
															· {source.publishedAt.slice(0, 10)}</small
														>{/if}
												</p>{/each}
										</Collapsible.Content></Collapsible.Root
									>{/if}
							</Card.Root>
							<Card.Root class="panel">
								<h3>A little feedback</h3>
								{#if latest?.feedback}<p>{latest.feedback.encouragement}</p>
									{#each latest.feedback.points as point}<div
											class="feedback-point"
										>
											<small>{point.category}</small>
											<blockquote>{point.quote}</blockquote>
											<p>{point.explanation}</p>
											<p class="hint">A hint: {point.hint}</p>
											<Collapsible.Root>
												<Collapsible.Trigger
													>Reveal a suggested revision</Collapsible.Trigger
												><Collapsible.Content>
													<p>{point.suggestion}</p>
												</Collapsible.Content></Collapsible.Root
											>
										</div>{/each}{:else}<div class="empty compact">
										When you are ready, get a few useful pointers.<br />No
										scores. Just your next step.
									</div>{/if}
							</Card.Root>
						</aside>
					</div>{:else}<Card.Root class="empty panel">
						<h2>Your first page starts with curiosity</h2>
						<p>
							Choose an everyday topic, or bring something you would like to
							explore.
						</p>
						<Button
							variant="default"
							class="primary"
							onclick={() => navigate('today')}
							><Icons.Sparkles aria-hidden="true" />Find a practice</Button
						>
					</Card.Root>{/if}
				<div class="section-heading">
					<h2>Every version, a small step</h2>
					<Button
						variant="ghost"
						class="text-button"
						onclick={() => (showHistory = !showHistory)}
						><Icons.History aria-hidden="true" />{showHistory
							? 'Hide versions'
							: 'View saved versions'}</Button
					>
				</div>
				{#if showHistory}{#each attempts as a}<Card.Root
							class="panel history-card"
						>
							<div class="spread">
								<strong>{a.practice.title}</strong><small
									>{new Date(a.createdAt).toLocaleString('en-IE')}</small
								>
							</div>
							<p class="preserve">{a.text}</p>
							{#if a.feedback}<p>{a.feedback.encouragement}</p>{/if}<Button
								variant="ghost"
								class="text-button"
								onclick={() => {
									choose(a.practice);
									edit(a.text);
								}}
								><Icons.ArrowRight aria-hidden="true" />Continue from this
								version</Button
							>
						</Card.Root>{:else}<div class="empty">
							Save a version of your writing to see it here.
						</div>{/each}{/if}
			{:else if tab === 'speaking'}
				<div class="eyebrow">LISTEN TO YOUR OWN PROGRESS</div>
				<div class="page-heading">
					<div>
						<h1>Reading room</h1>
						<p>
							It does not have to be perfect. Record a little, then listen back.
						</p>
					</div>
					<Button
						variant="outline"
						class="secondary"
						onclick={() => {
							mode = 'speaking';
							navigate('today');
						}}
						disabled={micBusy}
						><Icons.Plus aria-hidden="true" />Find a new script</Button
					>
				</div>
			{:else if tab === 'vocabulary'}
				<Vocabulary
					language={profile.language}
					{busy}
					canGenerate={aiConfigured}
					blocked={storageBroken || !!pendingAI}
					ongenerate={generateVocabulary}
				/>
			{:else if tab === 'review'}
				<div class="eyebrow">LITTLE NOTES, LASTING LEARNING</div>
				<div class="page-heading">
					<div>
						<h1>Review notes</h1>
						<p>
							Bring a little feedback to your next practice. {remaining} points to
							revisit.
						</p>
					</div>
					<span class="level-pill">{languageNames[profile.language]}</span>
				</div>
				<div class="review-grid">
					{#each reviewPoints as item}<Card.Root
							class="panel review-card"
							data-completed={notebook.reviews[item.key]}
						>
							<div class="spread">
								<Badge class="chip">{item.point.category}</Badge><small
									>{item.attempt.practice.title}</small
								>
							</div>
							<blockquote>{item.point.quote}</blockquote>
							<p>{item.point.explanation}</p>
							<div class="focus">{item.point.hint}</div>
							<Collapsible.Root>
								<Collapsible.Trigger>Suggested expression</Collapsible.Trigger
								><Collapsible.Content>
									<p>{item.point.suggestion}</p>
								</Collapsible.Content></Collapsible.Root
							>
							<Label class="check flex"
								><Checkbox
									aria-label="I have revisited this point"
									checked={notebook.reviews[item.key] ?? false}
									onCheckedChange={() => toggleReview(item.key)}
								/>I have revisited this point</Label
							>
						</Card.Root>{:else}<Card.Root class="empty panel">
							<span class="empty-symbol">↺</span>
							<h2>Keep the little things you learn</h2>
							<p>
								Your writing feedback is collected here. Mark a point when you
								have revisited it.
							</p>
							<Button
								variant="default"
								class="primary"
								onclick={() => navigate('writing')}
								><Icons.ArrowRight aria-hidden="true" />Try a little writing</Button
							>
						</Card.Root>{/each}
				</div>
			{:else if tab === 'profile'}
				<div class="eyebrow">A PRACTICE THAT FITS YOU</div>
				<div class="page-heading">
					<div>
						<h1>My learning profile</h1>
						<p>
							Your own pace, in every language. School stage and language level
							are separate.
						</p>
					</div>
				</div>
				<form
					class="panel profile-form"
					onsubmit={(e) => {
						e.preventDefault();
						saveProfile();
					}}
				>
					<h2>{languageNames[profile.language]} · Learning preferences</h2>
					<div class="form-grid">
						<Label class=" block"
							>School stage<NativeSelect
								class="w-full"
								bind:value={profile.ageGroup}
								><option>Middle school</option><option>High school</option
								></NativeSelect
							></Label
						><Label class=" block"
							>Language level<NativeSelect
								class="w-full"
								bind:value={profile.level}
								><option value="A1">A1 · Getting started</option><option
									value="A2">A2 · Everyday expression</option
								><option value="B1">B1 · Independent expression</option><option
									value="B2">B2 · More detailed discussion</option
								></NativeSelect
							></Label
						>
					</div>
					<Label class=" block"
						>Interests & everyday life<Input
							bind:value={profile.interests}
							maxlength={500}
							placeholder="What do you enjoy talking about?"
						/></Label
					><Label class=" block"
						>Vocabulary you have been learning<Textarea
							bind:value={profile.vocabulary}
							rows={3}
							maxlength={1000}
							placeholder="Add words, topics, or a textbook unit"
						></Textarea></Label
					><Label class=" block"
						>Grammar to practise<Textarea
							bind:value={profile.grammar}
							rows={3}
							maxlength={1000}
							placeholder="Past tense, verb forms, prepositions…"
						></Textarea></Label
					><Button
						variant="default"
						class="primary"
						type="submit"
						disabled={!ready || storageBroken}
						><Icons.Save aria-hidden="true" />Save my preferences</Button
					>
				</form>
				<Card.Root class="panel storage-panel">
					<h3>Your records, your learning</h3>
					<p>
						Drafts stay in this browser. Clearing browser data removes them.
						Recordings, practice scripts, notes and reading feedback are saved
						on this server in Reading history. Writing submitted for AI feedback
						is sent to the configured model provider. AI requests and responses
						are also saved privately on this server for recovery. Requesting a
						reading check sends the recording and language to your selected
						speech provider through this server. Remote reading voices send
						learning text to your selected TTS provider.
					</p>
					<Button variant="outline" class="secondary" onclick={exportData}
						><Icons.Download aria-hidden="true" />Export text backup</Button
					>
					<p class="fineprint">
						Download audio in Reading history. This local prototype has no
						accounts and is not ready for public multi-user hosting.
					</p>
				</Card.Root>
			{/if}
			<div hidden={tab !== 'speaking'}>
				{#if tab === 'speaking'}{#if current}<Card.Root
							class="panel script-panel"
						>
							<div class="spread">
								<Badge class="chip"
									>{current.profile.level} · {current.origin === 'demo'
										? 'Sample script'
										: 'Reading script'}</Badge
								><span class="fineprint">Take your time. Read it out loud.</span
								>
							</div>
							<h2>{current.title}</h2>
							{#if current.readingUnit}<p class="fineprint">
									Training unit · {readingUnits.find(
										(unit) => unit.value === current.readingUnit,
									)?.label}
								</p>{/if}
							{#key current.id + current.profile.language + current.script + (current.readingUnit ?? '')}<ReadingText
									text={current.script}
									unit={current.readingUnit}
									language={current.profile.language}
									recording={micBusy}
								/>{/key}
							<div class="vocab-list">
								{#each current.vocabulary as v}<span>{v}</span>{/each}
							</div>
							<p class="fineprint">{current.sourceNote}</p>
							{#if current.sources?.length}<Collapsible.Root>
									<Collapsible.Trigger
										>Research sources · {current.sources
											.length}</Collapsible.Trigger
									><Collapsible.Content>
										<p class="fineprint">
											Retrieved {current.searchedAt
												? new Date(current.searchedAt).toLocaleDateString(
														'en-IE',
													)
												: 'for this practice'}. Search excerpts inform this AI
											adaptation; check original sources for full context.
										</p>
										{#each current.sources as source}<p>
												<a href={source.url} target="_blank" rel="noreferrer"
													>{source.title} ↗</a
												>{#if source.publishedAt}<small>
														· {source.publishedAt.slice(0, 10)}</small
													>{/if}
											</p>{/each}
									</Collapsible.Content></Collapsible.Root
								>{/if}
						</Card.Root>{:else}<Card.Root class="empty panel">
							Prepare a script, or bring your own writing from the Writing
							studio.
						</Card.Root>{/if}{/if}
				<Recorder
					practice={current}
					language={profile.language}
					onbusy={(value) => (micBusy = value)}
				/>
			</div>
			{#if (tab === 'writing' || tab === 'speaking') && notebook.practices.some((p) => p.profile.language === profile.language)}<section
					class="practice-history"
				>
					<h3>Your practice shelf</h3>
					<ScrollArea
						class="max-h-48 [&_[data-slot=scroll-area-viewport]]:max-h-48"
						><div class="history-chips">
							{#each notebook.practices.filter((p) => p.profile.language === profile.language) as p}<Button
									variant="ghost"
									class="h-auto whitespace-normal text-left"
									data-active={selectedId === p.id}
									onclick={() => choose(p)}
									disabled={busy || micBusy}
									>{#if p.mode === 'writing'}<Icons.PenLine
											aria-hidden="true"
										/>{:else}<Icons.Mic aria-hidden="true" />{/if}
									{p.title}</Button
								>{/each}
						</div></ScrollArea
					>
				</section>{/if}
			<footer>
				<span>mr. kane</span> Every little expression counts.<span
					>MADE FOR CURIOUS MINDS</span
				>
			</footer>
		</div>
	</main>
</div>
