import type { DeepPartial, SectionUiConfig } from '$lib/config/content-ui';
import { AppBookIcon } from '$lib/components/icons';
import type { Component } from 'svelte';

export type ContentSectionLink = {
	label: string;
	href: string;
	icon?: Component<{ size?: number; class?: string }>;
	description?: string;
};

export type ContentSectionConfig = {
	/**
	 * URL-safe identifier used as the route segment and content directory name.
	 * The base path is derived as `/${id}`.
	 */
	id: string;
	label: string;
	navigation: ContentItem[];
	ui?: DeepPartial<SectionUiConfig>;
	icon?: Component;
	description?: string;
};

export type ContentItem = {
	slug: string;
	name: string;
	category?: string;
	showPagination?: boolean;
	items?: ContentItem[];
};

export const contentSections: ContentSectionConfig[] = [
	{
		id: 'docs',
		label: 'Docs',
		icon: AppBookIcon,
		description: 'Spektral documentation and API reference',
		navigation: [
			{
				slug: 'getting-started',
				name: 'Getting Started',
				items: [
					{ slug: '', name: 'Overview' },
					{ slug: 'getting-started', name: 'Introduction' },
					{ slug: 'concepts-and-architecture', name: 'Concepts & Architecture' }
				]
			},
			{
				slug: 'core-concepts',
				name: 'Core Concepts',
				items: [
					{ slug: 'defining-materials', name: 'Defining Materials' },
					{ slug: 'hooks-and-context', name: 'Hooks & Context' },
					{ slug: 'user-context', name: 'User Context' }
				]
			},
			{
				slug: 'rendering',
				name: 'Rendering',
				items: [
					{ slug: 'render-modes', name: 'Render Modes' },
					{ slug: 'render-passes', name: 'Render Passes' },
					{ slug: 'render-targets', name: 'Render Targets' },
					{ slug: 'frame-scheduler', name: 'Frame Scheduler' }
				]
			},
			{
				slug: 'compute',
				name: 'Compute',
				items: [
					{ slug: 'compute-shaders', name: 'Compute Shaders' },
					{ slug: 'storage-buffers', name: 'Storage Buffers' }
				]
			},
			{
				slug: 'shaders-textures',
				name: 'Shaders & Textures',
				items: [
					{ slug: 'writing-shaders', name: 'Writing Shaders' },
					{ slug: 'shader-includes-and-defines', name: 'Shader Includes & Defines' },
					{ slug: 'uniforms', name: 'Uniforms' },
					{ slug: 'textures', name: 'Textures' },
					{ slug: 'texture-loading', name: 'Texture Loading' }
				]
			},
			{
				slug: 'integrations',
				name: 'Integrations',
				items: [{ slug: 'integrations-typegpu', name: 'TypeGPU' }]
			},
			{
				slug: 'api-reference',
				name: 'API Reference',
				items: [
					{ slug: 'fragcanvas-reference', name: 'FragCanvas' },
					{ slug: 'api-material-reference', name: 'Material API' },
					{ slug: 'api-hooks-reference', name: 'Hooks API' },
					{ slug: 'api-passes-reference', name: 'Passes API' },
					{ slug: 'api-core-reference', name: 'Core API' },
					{ slug: 'api-advanced-reference', name: 'Advanced API' }
				]
			},
			{
				slug: 'advanced',
				name: 'Advanced',
				items: [
					{ slug: 'error-handling', name: 'Error Handling' },
					{ slug: 'testing-and-internals', name: 'Testing & Internals' },
					{ slug: 'changelog', name: 'Changelog' }
				]
			}
		]
	}
];
