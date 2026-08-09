export type ContentFrontmatter = {
	title?: string;
	name?: string;
	description?: string;
};

const FRONTMATTER_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FRONTMATTER_LINE_RE = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/;

function stripMatchingQuotes(value: string): string {
	if (value.length < 2) return value;
	const quote = value[0];
	if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
		return value.slice(1, -1);
	}
	return value;
}

function parseFrontmatterBlock(block: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const line of block.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const match = FRONTMATTER_LINE_RE.exec(trimmed);
		if (!match) continue;

		const [, key, rawValue] = match;
		parsed[key] = stripMatchingQuotes(rawValue.trim());
	}

	return parsed;
}

export function parseContentSource(rawSource: string): {
	metadata: ContentFrontmatter;
	body: string;
} {
	const match = FRONTMATTER_BLOCK_RE.exec(rawSource);
	if (!match) {
		return { metadata: {}, body: rawSource };
	}

	const parsed = parseFrontmatterBlock(match[1]);

	return {
		metadata: {
			title: parsed.title,
			name: parsed.name,
			description: parsed.description
		},
		body: rawSource.slice(match[0].length)
	};
}
