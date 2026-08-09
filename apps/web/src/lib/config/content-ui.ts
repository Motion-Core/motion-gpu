/**
 * Supported package manager tabs shown in installation examples.
 */
export const availablePackageManagers = ['npm', 'pnpm', 'bun', 'yarn'] as const;

/**
 * Union of package manager keys derived from `availablePackageManagers`.
 */
export type PackageManagerOption = (typeof availablePackageManagers)[number];

export type SectionUiConfig = {
	search: {
		enabled: boolean;
		triggerPlaceholder: string;
		dialogPlaceholder: string;
		noResultsLabel: string;
		submitHintLabel: string;
		hotkey: {
			enabled: boolean;
			key: string;
			metaOrCtrl: boolean;
			label: string;
		};
		maxGroups: number;
		maxChildrenPerGroup: number;
	};
	sidebar: {
		navigationLabel: string;
		showThemeToggle: boolean;
		showRepositoryLink: boolean;
		repositoryAriaLabel: string;
	};
	toc: {
		enabled: boolean;
		title: string;
		emptyLabel: string;
		minViewportWidth: number;
		defaultSelector: string;
		selectorOverrides: {
			slugPrefix: string;
			selector: string;
		}[];
	};
	pageActions: {
		enabled: boolean;
		showCopyMarkdown: boolean;
		showRepositoryLink: boolean;
		repositoryLinkLabel: string;
		repositoryBranch: string;
		moreActionsAriaLabel: string;
		copyLabels: {
			desktopIdle: string;
			mobileIdle: string;
			copying: string;
			success: string;
			error: string;
		};
		assistantPromptTemplate: string;
		assistants: {
			chatgpt: {
				enabled: boolean;
				label: string;
				hrefTemplate: string;
			};
			claude: {
				enabled: boolean;
				label: string;
				hrefTemplate: string;
			};
		};
	};
	pagination: {
		enabled: boolean;
		previousLabel: string;
		nextLabel: string;
	};
};

export type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (infer U)[]
		? DeepPartial<U>[]
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

/**
 * Global, strongly-typed settings for interactive content UI elements.
 * Adjust defaults here to tune behavior across the entire site experience.
 */
export type ContentUiConfig = SectionUiConfig & {
	packageManager: {
		enabled: PackageManagerOption[];
		default: PackageManagerOption;
		storageKey: string;
	};
	theme: {
		storageKey: string;
		defaultMode: 'light' | 'dark' | 'system';
	};
};

/**
 * Default section-level UI configuration shared across content sections.
 */
export const sectionUiDefaults: SectionUiConfig = {
	search: {
		enabled: true,
		triggerPlaceholder: 'Search...',
		dialogPlaceholder: 'Search...',
		noResultsLabel: 'No results found.',
		submitHintLabel: 'Go to page',
		hotkey: {
			enabled: true,
			key: 'k',
			metaOrCtrl: true,
			label: '⌘ K'
		},
		maxGroups: 20,
		maxChildrenPerGroup: 5
	},
	sidebar: {
		navigationLabel: 'Docs',
		showThemeToggle: true,
		showRepositoryLink: true,
		repositoryAriaLabel: 'Open project repository'
	},
	toc: {
		enabled: true,
		title: 'On this page',
		emptyLabel: 'No headings',
		minViewportWidth: 1280,
		defaultSelector: '[data-doc-content] > h2, [data-doc-content] > h3',
		selectorOverrides: [{ slugPrefix: 'changelog', selector: '[data-doc-content] > h2' }]
	},
	pageActions: {
		enabled: true,
		showCopyMarkdown: true,
		showRepositoryLink: true,
		repositoryLinkLabel: 'Open in GitHub',
		repositoryBranch: 'master',
		moreActionsAriaLabel: 'More actions',
		copyLabels: {
			desktopIdle: 'Copy as Markdown',
			mobileIdle: 'Copy Markdown',
			copying: 'Copying…',
			success: 'Copied!',
			error: 'Copy failed'
		},
		assistantPromptTemplate:
			"I'm currently viewing the documentation at {url}. Please assist me in learning how to work with it. I may need clarification on concepts, sample code demonstrations, or troubleshooting guidance related to this documentation.",
		assistants: {
			chatgpt: {
				enabled: true,
				label: 'Open in ChatGPT',
				hrefTemplate: 'https://chatgpt.com/?hints=search&prompt={prompt}'
			},
			claude: {
				enabled: true,
				label: 'Open in Claude',
				hrefTemplate: 'https://claude.ai/new?q={prompt}'
			}
		}
	},
	pagination: {
		enabled: true,
		previousLabel: 'Previous',
		nextLabel: 'Next'
	}
};

/**
 * Centralized UI defaults used across content sections and shared layout helpers.
 */
export const contentUiDefaults: ContentUiConfig = {
	...sectionUiDefaults,
	packageManager: {
		enabled: ['npm', 'pnpm', 'bun', 'yarn'],
		default: 'npm',
		storageKey: 'docs-package-manager'
	},
	theme: {
		storageKey: 'docs-theme',
		defaultMode: 'system'
	}
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeDeep = <T>(base: T, overrides: DeepPartial<T>): T => {
	if (!isPlainObject(base) || !isPlainObject(overrides)) {
		return overrides as T;
	}

	const result: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) continue;
		const baseValue = (base as Record<string, unknown>)[key];
		if (Array.isArray(baseValue) && Array.isArray(value)) {
			result[key] = value;
			continue;
		}
		if (isPlainObject(baseValue) && isPlainObject(value)) {
			result[key] = mergeDeep(baseValue, value as DeepPartial<typeof baseValue>);
			continue;
		}
		result[key] = value;
	}

	return result as T;
};

export function mergeSectionUiConfig(
	overrides: DeepPartial<SectionUiConfig> = {}
): SectionUiConfig {
	return mergeDeep(sectionUiDefaults, overrides);
}

/**
 * Replaces `{token}` placeholders in a template string with provided values.
 *
 * @param template String that may contain `{key}` placeholders.
 * @param variables Object with replacement values indexed by key.
 * @returns Template with placeholders replaced; missing keys resolve to an empty string.
 */
function interpolateTemplate(template: string, variables: Record<string, string>) {
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => variables[key] ?? '');
}

/**
 * Resolves the heading selector for table-of-contents generation based on a slug.
 *
 * @param tocConfig Section toc configuration.
 * @param slug Relative content slug (for example `changelog/1.0.0`).
 * @returns CSS selector used to extract headings from page content.
 */
export function resolveTocSelector(tocConfig: SectionUiConfig['toc'], slug?: string | null) {
	const normalizedSlug = slug ?? '';
	const override = tocConfig.selectorOverrides.find((item) =>
		normalizedSlug.startsWith(item.slugPrefix)
	);
	return override?.selector ?? tocConfig.defaultSelector;
}

/**
 * Builds AI assistant links (ChatGPT/Claude) for the current page URL.
 *
 * @param pageActionsConfig Section page actions configuration.
 * @param rawUrl Absolute URL of the current page.
 * @returns Encoded assistant URLs when enabled; otherwise `null` values.
 */
export function resolveAssistantUrls(
	pageActionsConfig: SectionUiConfig['pageActions'],
	rawUrl?: string | null
) {
	if (!rawUrl || !pageActionsConfig.enabled) {
		return {
			chatGptUrl: null,
			claudeUrl: null
		};
	}

	const prompt = interpolateTemplate(pageActionsConfig.assistantPromptTemplate, {
		url: rawUrl
	});
	const encodedPrompt = encodeURIComponent(prompt);
	const encodedUrl = encodeURIComponent(rawUrl);
	const templateVars = {
		prompt: encodedPrompt,
		url: rawUrl,
		encodedUrl
	};

	return {
		chatGptUrl: pageActionsConfig.assistants.chatgpt.enabled
			? interpolateTemplate(pageActionsConfig.assistants.chatgpt.hrefTemplate, templateVars)
			: null,
		claudeUrl: pageActionsConfig.assistants.claude.enabled
			? interpolateTemplate(pageActionsConfig.assistants.claude.hrefTemplate, templateVars)
			: null
	};
}

/**
 * Creates a deep link to a repository file.
 *
 * @param pageActionsConfig Section page actions configuration.
 * @param repositoryBaseUrl Repository root URL (for example `https://github.com/org/repo`).
 * @param repositoryRelativePath File path prefixed with `/` from repository root.
 * @returns URL pointing to the configured branch and target file.
 */
export function resolveRepositoryFileUrl(
	pageActionsConfig: SectionUiConfig['pageActions'],
	repositoryBaseUrl: string,
	repositoryRelativePath: string
) {
	const branch = pageActionsConfig.repositoryBranch.trim();
	const safeBranch = branch.length > 0 ? branch : 'main';
	return `${repositoryBaseUrl}/blob/${safeBranch}${repositoryRelativePath}`;
}
