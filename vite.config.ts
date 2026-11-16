import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vitest/config';
export default defineConfig({
	resolve: {
		alias: {
			'tw-animate-css': fileURLToPath(
				new URL(
					'./node_modules/tw-animate-css/dist/tw-animate.css',
					import.meta.url,
				),
			),
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	plugins: [tailwindcss(), sveltekit({ adapter: adapter() })],
	test: { include: ['tests/**/*.test.ts'] },
});
