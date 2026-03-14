import type { DocItem } from '$lib/types/doc';

export const docsNavigation: DocItem[] = [
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
		slug: 'shaders-textures',
		name: 'Shaders & Textures',
		items: [
			{ slug: 'writing-shaders', name: 'Writing Shaders' },
			{
				slug: 'shader-includes-and-defines',
				name: 'Shader Includes & Defines'
			},
			{ slug: 'uniforms', name: 'Uniforms' },
			{ slug: 'textures', name: 'Textures' },
			{ slug: 'texture-loading', name: 'Texture Loading' }
		]
	},
	{
		slug: 'api-reference',
		name: 'API Reference',
		items: [
			{ slug: 'fragcanvas-reference', name: 'FragCanvas' },
			{ slug: 'api-material-reference', name: 'Material API' },
			{ slug: 'api-hooks-reference', name: 'Hooks API' },
			{ slug: 'api-passes-reference', name: 'Passes API' },
			{ slug: 'api-core-reference', name: 'Core Runtime API' },
			{ slug: 'api-advanced-reference', name: 'Advanced API' }
		]
	},
	{
		slug: 'advanced',
		name: 'Advanced',
		items: [
			{ slug: 'error-handling', name: 'Error Handling' },
			{ slug: 'testing-and-internals', name: 'Testing & Internals' }
		]
	}
];
