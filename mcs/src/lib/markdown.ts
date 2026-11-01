const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Links and images may point at web pages, mail, or paths in MCS; never scripts. */
function safeUrl(url: string): string {
	const value = url.trim();
	if (/^(https?:|mailto:)/i.test(value)) return value;
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '#';
	return value;
}

/**
 * Small Markdown renderer for notes. The source is HTML-escaped before any
 * markup is added, so a note can never inject elements or attributes.
 */
export function renderMarkdown(src: string): string {
	// NUL delimits placeholders below, so it may not appear in the source.
	src = src.replace(/\x00/g, '');
	// Pre-process: extract fenced code blocks to prevent interference
	const codeBlocks: string[] = [];
	src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
		codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`);
		return `\x00CODE${codeBlocks.length - 1}\x00`;
	});

	src = escapeHtml(src);

	// Links and images become placeholders right after escaping, so no later
	// pass (emphasis, inline code, line breaks) can rewrite text inside an
	// attribute. Their text is shown as plain escaped text.
	const inlineLinks: string[] = [];
	const hold = (html: string) => {
		inlineLinks.push(html);
		return `\x00LINK${inlineLinks.length - 1}\x00`;
	};
	// One pass for both, so an image is never replaced first and then
	// wrapped by a link. A match that contains a placeholder (a code block
	// inside the brackets) is left as text: placeholders must never reach an
	// attribute.
	src = src.replace(
		/(!?)\[([^\]\n]*)\]\(([^)\s]+)\)/g,
		(match, bang: string, text: string, rawUrl: string) => {
			if (match.includes('\x00') || (!bang && !text)) return match;
			const url = safeUrl(rawUrl);
			if (bang) return hold(`<img src="${url}" alt="${text}" style="max-width:100%" />`);
			if (/\.pdf(?:[?#].*)?$/i.test(url)) {
				return hold(
					`<div class="md-pdf"><iframe src="${url}" title="${text}"></iframe><a class="md-file-link" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a></div>`
				);
			}
			return hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
		}
	);

	// GFM tables
	const tableRegex = /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm;
	src = src.replace(tableRegex, (_match, headerRow: string, _sepRow: string, bodyBlock: string) => {
		const headers = headerRow
			.split('|')
			.filter((c: string) => c.trim())
			.map((c: string) => c.trim());
		const rows = bodyBlock
			.trim()
			.split('\n')
			.map((r: string) =>
				r
					.split('|')
					.filter((c: string) => c.trim())
					.map((c: string) => c.trim())
			);
		let table = '<table><thead><tr>';
		for (const h of headers) table += `<th>${h}</th>`;
		table += '</tr></thead><tbody>';
		for (const row of rows) {
			table += '<tr>';
			for (const cell of row) table += `<td>${cell}</td>`;
			table += '</tr>';
		}
		table += '</tbody></table>';
		return table;
	});

	let html = src
		// inline code
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		// headings
		.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
		.replace(/^### (.+)$/gm, '<h3>$1</h3>')
		.replace(/^## (.+)$/gm, '<h2>$1</h2>')
		.replace(/^# (.+)$/gm, '<h1>$1</h1>')
		// bold italic
		.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		// strikethrough
		.replace(/~~(.+?)~~/g, '<del>$1</del>')
		// horizontal rule
		.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr />')
		// blockquotes — group consecutive >-lines
		.replace(/(^&gt; .+$(\n^&gt; .+$)*)/gm, (block: string) => {
			const inner = block.replace(/^&gt; /gm, '');
			return `<blockquote>${inner}</blockquote>`;
		})
		// ordered list items
		.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
		// unordered list items
		.replace(/^[-*+] (.+)$/gm, '<li>$1</li>')
		// paragraphs (double newline)
		.replace(/\n\n/g, '</p><p>')
		// single newline → <br>
		.replace(/\n/g, '<br />');

	// Wrap consecutive <li> in <ul>, consecutive <oli> in <ol>
	html = html
		.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
		.replace(/<\/ul>\s*<ul>/g, '')
		.replace(/(<oli>[\s\S]*?<\/oli>)/g, '<ol><li>$1</li></ol>')
		.replace(/<\/ol>\s*<ol>/g, '')
		.replace(/<\/?oli>/g, '');

	// Restore links, then fenced code blocks
	html = html.replace(/\x00LINK(\d+)\x00/g, (_, i) => inlineLinks[Number(i)]);
	html = html.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[Number(i)]);

	return '<p>' + html + '</p>';
}
