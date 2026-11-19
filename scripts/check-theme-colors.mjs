import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const theme = 'src/lib/styles/theme.css';
// System colors (Canvas/CanvasText), transparent and currentColor intentionally
// remain usable. Scan authored CSS, including Svelte style blocks and attributes.
const literal =
	/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(|:\s*(?:white|black)\s*(?=[;!}])|\b(?:bg|text|border|ring|fill|stroke)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?\b/gim;
const violations = [];
async function scan(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) await scan(path);
		else if (/\.(css|svelte)$/.test(path) && relative(root, path) !== theme) {
			const source = (await readFile(path, 'utf8')).replace(
				/\/\*[\s\S]*?\*\//g,
				(comment) => comment.replace(/[^\n]/g, ' '),
			);
			for (const match of source.matchAll(literal)) {
				const line = source.slice(0, match.index).split('\n').length;
				violations.push(`${relative(root, path)}:${line}: ${match[0].trim()}`);
			}
		}
	}
}
await scan(join(root, 'src'));
if (violations.length) {
	console.error(`Move color literals to ${theme}:\n${violations.join('\n')}`);
	process.exitCode = 1;
} else {
	console.log(`All authored application colors use ${theme}.`);
}
