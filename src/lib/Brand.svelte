<script lang="ts">
	let { companion = 'Bring language to life' }: { companion?: string } =
		$props();
</script>

<a class="kane-brand" href="/" aria-label="Mr. Kane home">
	<svg viewBox="0 0 52 56" aria-hidden="true" focusable="false">
		<path
			d="M24 8Q20 3 26 2"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		/>
		<path
			d="M26 8C10 8 3 18 4 29C4 38 10 43 16 45L11 53L25 47C40 47 49 38 48 27C47 16 39 8 26 8Z"
			fill="var(--brand-accent)"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linejoin="round"
		/>
		<circle cx="18" cy="27" r="2.4" fill="currentColor" /><circle
			cx="34"
			cy="27"
			r="2.4"
			fill="currentColor"
		/>
		<path
			d="M22 34Q26 39 31 34"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
		/>
	</svg>
	<span class="wordmark"
		>Mr. <span class="brand-highlight">Kane</span><small>{companion}</small
		></span
	>
</a>
