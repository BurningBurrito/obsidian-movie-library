import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { renderTemplate } from '../src/core/render';

const now = { format: (format: string) => ({ 'YYYY-MM-DD': '2026-10-06', 'YYYY-MM-DD HH:mm:ss': '2026-10-06 12:00:00', HH: '12' })[format] ?? `<${format}>` };
const props = (note: string) => parse(note.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '') as Record<string, unknown>;

describe('renderTemplate', () => {
	it('keeps the properties valid YAML whatever the text contains', () => {
		const note = renderTemplate('---\ntitle: {{title}}\ndescription: {{description}}\noriginalTitle: {{originalTitle}}\n---\n', {
			title: 'Yes',
			description: 'Cobb says: "an idea is like a virus" # not a comment',
			originalTitle: "'Quoted' start",
		}, now);
		assert.deepEqual(props(note), { title: 'Yes', description: 'Cobb says: "an idea is like a virus" # not a comment', originalTitle: "'Quoted' start" });
	});

	it('writes lists as list properties, numbers as numbers, and numbers written as text as text', () => {
		const note = renderTemplate('---\ndirector: {{director}}\nruntime: {{runtime}}\nid: {{id}}\n---\n', {
			director: ['Lana Wachowski', 'Lilly Wachowski'],
			runtime: 136,
			id: '0133093',
		}, now);
		assert.deepEqual(props(note), { director: ['Lana Wachowski', 'Lilly Wachowski'], runtime: 136, id: '0133093' });
	});

	it('leaves empty values empty and unknown variables untouched', () => {
		const note = renderTemplate('---\noriginalTitle: {{originalTitle}}\ntags: {{unknown}}\n---\n{{other}} and <% tp.file.title %>\n', { originalTitle: '' }, now);
		assert.match(note, /^originalTitle:$/m);
		assert.match(note, /^tags: \{\{unknown\}\}$/m);
		assert.match(note, /\{\{other\}\} and <% tp\.file\.title %>/);
	});

	it('formats dates and shows lists as text in the note body', () => {
		const note = renderTemplate('{{date}} {{date:YYYY-MM-DD HH:mm:ss}} {{time:HH}} — with {{cast}}', { cast: ['A', 'B'] }, now);
		assert.equal(note, '2026-10-06 2026-10-06 12:00:00 12 — with A, B');
	});

	it('keeps Japanese titles readable and unquoted', () => {
		const note = renderTemplate('---\njapaneseTitle: {{japaneseTitle}}\n---\n', { japaneseTitle: '葬送のフリーレン' }, now);
		assert.match(note, /^japaneseTitle: 葬送のフリーレン$/m);
		assert.equal(props(note).japaneseTitle, '葬送のフリーレン');
	});
});
