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
