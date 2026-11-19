<script lang="ts">
	let { role = 'assistant' }: { role?: 'assistant' | 'user' } = $props();
</script>

<!-- Decorative: the adjacent author label identifies the speaker. -->
<svg
	viewBox="0 0 32 32"
	width="30"
	height="30"
	aria-hidden="true"
	focusable="false"
>
	{#if role === 'user'}
		<circle
			cx="16"
			cy="16"
			r="15.25"
			style="fill:var(--student-message-avatar-background)"
		/>
		<path
			d="M5.55 26.2C6.6 22.6 10.6 20.6 16 20.6C21.4 20.6 25.4 22.6 26.45 26.2A14.6 14.6 0 0 1 5.55 26.2Z"
			stroke-width="1.5"
			stroke-linejoin="round"
			style="fill:var(--brand-accent);stroke:var(--foreground)"
		/>
		<path
			d="M13 21.1Q16 23.6 19 21.1"
			stroke-width="1.3"
			stroke-linecap="round"
			stroke-linejoin="round"
			style="fill:var(--background);stroke:var(--foreground)"
		/>
		<circle
			cx="9.7"
			cy="14.4"
			r="1.5"
			stroke-width="1.3"
			style="fill:var(--background);stroke:var(--foreground)"
		/>
		<circle
			cx="22.3"
			cy="14.4"
			r="1.5"
			stroke-width="1.3"
			style="fill:var(--background);stroke:var(--foreground)"
		/>
		<circle
			cx="16"
			cy="13.2"
			r="6.6"
			stroke-width="1.6"
			style="fill:var(--background);stroke:var(--foreground)"
		/>
		<path
			d="M9.43 12.6A6.6 6.6 0 0 1 22.57 12.6Q21 9.6 18.6 10.6Q16.8 8.6 14.2 10.4Q11.6 9.2 9.43 12.6Z"
			stroke-width="1.2"
			stroke-linejoin="round"
			style="fill:var(--foreground);stroke:var(--foreground)"
		/> <circle cx="13.6" cy="14.7" r="1.05" style="fill:var(--foreground)" />
		<circle cx="18.4" cy="14.7" r="1.05" style="fill:var(--foreground)" />
		<path
			d="M14.1 17.1Q16 18.8 17.9 17.1"
			fill="none"
			stroke-width="1.3"
			stroke-linecap="round"
			style="stroke:var(--foreground)"
		/>
		<circle
			cx="16"
			cy="16"
			r="15.25"
			fill="none"
			stroke-width="1.25"
			style="stroke:var(--foreground)"
		/>
	{:else}
		<circle
			cx="16"
			cy="16"
			r="15.25"
			stroke-width="1.25"
			style="fill:var(--message-avatar-background);stroke:var(--message-avatar-border,var(--foreground))"
		/>
		<g transform="translate(0 1.4)">
			<path
				d="M16 9C20.7 9 24 11.9 24 15.6C24 19.3 20.7 22.2 16 22.2C14.9 22.2 13.9 22 13 21.7L9.6 23.8L10.4 20.6C8.9 19.4 8 17.6 8 15.6C8 11.9 11.3 9 16 9Z"
				stroke-width="1.6"
				stroke-linejoin="round"
				style="fill:var(--background);stroke:var(--foreground)"
			/>
			<path
				d="M16 9C15.9 7.7 16.6 6.7 17.8 6.6"
				fill="none"
				stroke-width="1.4"
				stroke-linecap="round"
				style="stroke:var(--foreground)"
			/>
			<path
				d="M17.8 6.6C18.5 5.4 20.1 5.2 20.9 6.2C20.1 7.2 18.7 7.4 17.8 6.6Z"
				stroke-width="1.1"
				stroke-linejoin="round"
				style="fill:var(--brand-accent);stroke:var(--foreground)"
			/> <circle cx="13.5" cy="15.2" r="1.2" style="fill:var(--foreground)" />
			<circle cx="18.5" cy="15.2" r="1.2" style="fill:var(--foreground)" />
			<path
				d="M14.3 18.1Q16 19.5 17.7 18.1"
				fill="none"
				stroke-width="1.4"
				stroke-linecap="round"
				style="stroke:var(--foreground)"
			/>
		</g>
	{/if}
</svg>

<style>
	svg {
		display: block;
		flex: none;
	}
</style>
