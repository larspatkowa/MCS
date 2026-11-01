import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
	it('renders common markup', () => {
		const html = renderMarkdown('# Go/no-go\n\n**Range** clear\n\n- igniter\n- tracker\n\n> hold');
		expect(html).toContain('<h1>Go/no-go</h1>');
		expect(html).toContain('<strong>Range</strong>');
		expect(html).toContain('<ul><li>igniter</li>');
		expect(html).toContain('<blockquote>hold</blockquote>');
	});

	it('never passes raw HTML through', () => {
		const html = renderMarkdown('<img src=x onerror=alert(1)><script>alert(2)</script>');
		expect(html).not.toMatch(/<img|<script/i);
		expect(html).toContain('&lt;script&gt;');
	});

	it('neutralizes script URLs and attribute breakouts', () => {
		expect(renderMarkdown('[x](javascript:alert(1))')).toContain('href="#"');
		expect(renderMarkdown('![x](data:text/html,hi)')).toContain('src="#"');
		const breakout = renderMarkdown('[x](https://a.example/" onmouseover="alert(1))');
		expect(breakout).not.toContain('" onmouseover="');
		expect(renderMarkdown('```\n<b>\n```')).toContain('&lt;b&gt;');
		// Formatting passes must not reach inside attributes.
		expect(renderMarkdown('[x](https://a.example/*b*/`c`)')).toContain(
			'href="https://a.example/*b*/`c`"'
		);
		// A smuggled placeholder cannot pull a code block into an attribute.
		const smuggled = renderMarkdown('```js\nq\n```\n[x](\x00CODE0\x00)');
		expect(smuggled).not.toMatch(/href="[^"]*<pre/);
		// Nested image inside a link, and a fenced block inside link text.
		for (const source of [
			'[![a](https://x.example/i.png)](https://y.example)',
			'[```\nq\n```](https://y.example/d.pdf)'
		]) {
			const html = renderMarkdown(source);
			for (const [, value] of html.matchAll(/(?:href|src|title|alt)="([^"]*)"/g)) {
				expect(value, source).not.toMatch(/[<>\x00]/);
			}
		}
	});

	it('keeps web, mail and relative links and renders images', () => {
		expect(renderMarkdown('[docs](https://example.org/a?b=1)')).toContain(
			'href="https://example.org/a?b=1"'
		);
		expect(renderMarkdown('[mail](mailto:ops@example.org)')).toContain(
			'href="mailto:ops@example.org"'
		);
		expect(renderMarkdown('![pad](/branding/pad.png)')).toContain('<img src="/branding/pad.png"');
	});
});
