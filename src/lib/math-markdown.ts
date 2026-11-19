import { Marked } from 'marked';
import katex from 'katex';
function escape(s: string) {
	return s.replace(
		/[&<>"']/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				c
			]!,
	);
}
function safeLink(href: string) {
	return (
		/^https?:\/\//i.test(href) ||
		/^\/api\/math\/library\/[\w/.-]+\.png$/.test(href)
	);
}
const md = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		html({ text }) {
			return escape(text);
		},
		link({ href, tokens }) {
			const label = this.parser.parseInline(tokens);
			return safeLink(href)
				? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
				: label;
		},
		image({ href, text }) {
			return /^\/api\/math\/library\/[\w/-]+\.png$/.test(href)
				? `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy" />`
				: escape(text);
		},
	},
});
export function renderMathMarkdown(text: string) {
	// Raw HTML is escaped by the renderer; only locally generated KaTeX markup is inserted afterward.
	const equations: string[] = [];
	let marker = 'KANEMATHEXPRESSION';
	while (text.includes(marker)) marker += 'X';
	const prepared = text.replace(
		/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$((?:\\[^\n]|[^$\\\n])+?)\$|\\\[([\s\S]*?)\\\]|\\\(([^\n]*?)\\\)/g,
		(_all, display, inline, bracket, paren) => {
			const formula = display ?? inline ?? bracket ?? paren;
			const index = equations.length;
			equations.push(
				katex.renderToString(formula, {
					displayMode: display !== undefined || bracket !== undefined,
					throwOnError: false,
					trust: false,
					strict: 'ignore',
					maxExpand: 500,
					maxSize: 20,
				}),
			);
			return `${marker}${index}END`;
		},
	);
	return (md.parse(prepared, { async: false }) as string).replace(
		new RegExp(`${marker}(\\d+)END`, 'g'),
		(_m, i) => equations[+i],
	);
}
