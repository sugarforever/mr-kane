/** Anchor multiline selections to their first line horizontally, retaining the last line for flipping. */
export function selectionAnchor(
	rects: readonly DOMRect[],
	fallback: DOMRect,
): DOMRect {
	const lines = rects.filter((rect) => rect.width > 0 && rect.height > 0);
	if (!lines.length) return fallback;
	const first = lines[0];
	const last = lines[lines.length - 1];
	return new DOMRect(
		first.left,
		first.top,
		first.width,
		last.bottom - first.top,
	);
}

/** Keep detached results visible even when the toolbar sits at a viewport edge. */
export function resultTop(
	preferred: number,
	height: number,
	viewportHeight: number,
) {
	return Math.max(12, Math.min(preferred, viewportHeight - height - 12));
}
