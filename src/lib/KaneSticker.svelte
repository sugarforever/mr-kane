<script lang="ts">
	let {
		variant = 'hello',
		class: className = '',
	}: {
		variant?: 'hello' | 'writing' | 'reading' | 'empty' | 'complete';
		class?: string;
	} = $props();
</script>

<!-- Decorative only: nearby copy and controls carry all meaning. No motion. -->
<svg
	class="kane-sticker {className}"
	viewBox="0 0 320 280"
	aria-hidden="true"
	focusable="false"
	fill="none"
>
	<g class="die-cut" stroke-linecap="round" stroke-linejoin="round">
		<path
			d="M84 172C62 152 58 121 70 93C83 63 111 48 149 51C192 53 218 79 220 114C224 151 205 176 173 185C150 192 126 188 108 180L78 200Z"
		/>
		<path
			d="M148 51C142 34 146 22 156 16C174 8 189 16 187 23C175 33 161 32 153 28"
		/>
	</g>
	<g class="line" stroke-linecap="round" stroke-linejoin="round">
		<path
			class="body"
			d="M84 172C62 152 58 121 70 93C83 63 111 48 149 51C192 53 218 79 220 114C224 151 205 176 173 185C150 192 126 188 108 180L78 200Z"
		/>
		<path
			class="spark"
			d="M148 51C142 34 146 22 156 16C174 8 189 16 187 23C175 33 161 32 153 28"
		/>
		<path class="shade" d="M173 174C190 167 200 156 205 141" />
		<ellipse class="cheek" cx="106" cy="139" rx="10" ry="5" />
		<ellipse class="cheek" cx="185" cy="137" rx="10" ry="5" />
		{#if variant === 'complete'}
			<path d="M115 116L122 109L129 116M163 116L170 109L177 116" />
		{:else}
			<circle class="eye" cx="123" cy="118" r="5" /><circle
				class="eye"
				cx="169"
				cy="116"
				r="5"
			/>
		{/if}
		<path
			d={variant === 'empty'
				? 'M139 150Q147 144 155 150'
				: 'M137 142Q147 154 159 141'}
		/>
		{#if variant === 'writing' || variant === 'hello'}
			<path class="body" d="M214 142Q238 158 254 137L262 143Q244 173 214 155" />
			<path
				class="body"
				d="M164 211Q186 198 211 208Q235 195 257 205V251Q234 241 211 254Q187 242 164 253Z"
			/>
			<path
				d="M211 209V249M175 220Q187 215 201 220M175 232Q187 227 201 232M222 218Q233 214 246 218"
			/>
			<path class="spark" d="M250 104L264 108L244 217L234 229L231 213Z" />
			<path
				class="body"
				d="M250 104L253 89Q254 84 260 85L267 87Q271 88 270 94L267 108Z"
			/>
			<path d="M250 115L264 119M234 207L246 210" />
			<circle class="body" cx="251" cy="150" r="9" />
		{:else if variant === 'reading'}
			<path
				class="body"
				d="M79 155Q115 143 145 160Q174 143 211 154V223Q176 213 146 230Q113 214 79 224Z"
			/>
			<path
				d="M145 161V225M91 172Q112 168 132 177M91 185Q112 181 132 190M160 176Q178 168 198 172M160 190Q178 181 198 185"
			/>
			<path class="spark" d="M180 151L192 150V181L186 177L180 183Z" />
		{:else if variant === 'empty'}
			<path class="body" d="M189 161L220 183L207 211L176 190Z" /><circle
				class="body"
				cx="220"
				cy="183"
				r="25"
			/>
			<path d="M237 202L258 229" stroke-width="12" />
		{:else}
			<path
				class="spark"
				d="M224 147L233 163L252 167L239 180L241 199L224 190L207 199L210 180L196 167L216 163Z"
			/>
			<path d="M217 174L223 180L234 168" />
		{/if}
		{#if variant === 'hello'}
			<path
				class="spark"
				d="M31 40H76Q85 40 85 49V76Q85 84 76 84H67L74 100L51 84H31Q22 84 22 76V49Q22 40 31 40Z"
			/>
			<path
				d="M39 68L47 50L55 68M42 61H52M64 59Q75 52 73 65L73 70M73 62Q60 59 64 68Q69 74 73 66"
				stroke-width="2.5"
			/>
			<path
				class="body"
				d="M34 206H65V239Q49 249 34 239ZM65 212Q82 208 78 224Q74 232 65 229"
			/>
			<path d="M42 197Q48 191 43 184M55 196Q61 190 56 183" />
		{/if}
		<path
			class="spark"
			d="M264 39L270 51L282 56L270 62L264 75L258 62L245 56L258 51Z"
		/>
		<path
			class="body"
			d="M35 126L39 134L48 138L39 142L35 151L31 142L22 138L31 134Z"
		/>
	</g>
</svg>

<style>
	.kane-sticker {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
		filter: drop-shadow(0 3px 3px var(--sticker-shadow));
	}
	.die-cut {
		stroke: var(--sticker-paper);
		stroke-width: 13px;
		fill: var(--sticker-paper);
	}
	.line {
		stroke: var(--sticker-line);
		stroke-width: 3.5px;
	}
	.body {
		fill: var(--sticker-paper);
	}
	.spark {
		fill: var(--brand-accent);
	}
	.cheek {
		fill: var(--brand-accent);
		stroke: none;
	}
	.eye {
		fill: var(--sticker-line);
		stroke: none;
	}
	.shade {
		stroke: var(--brand-accent);
		stroke-width: 10px;
	}
</style>
