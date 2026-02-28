export type DocEntry = {
	slug: string;
	title: string;
	description: string;
};

export type DocRouteGroup = {
	id: string;
	title: string;
	entries: DocEntry[];
};

export const docsRouteGroups: DocRouteGroup[] = [
	{
		id: 'foundations',
		title: 'Foundations',
		entries: [
			{
				slug: '',
				title: 'Overview',
				description: 'Core mental model and map of the MotionGPU documentation.'
			},
			{
				slug: 'concepts-and-architecture',
				title: 'Concepts and Architecture',
				description:
					'Core runtime goals and architecture: canvas ownership, material pipeline, renderer, and scheduler.'
			},
			{
				slug: 'getting-started',
				title: 'Getting Started',
				description: 'Install MotionGPU and build your first fullscreen shader runtime in Svelte 5.'
			}
		]
	},
	{
		id: 'runtime-systems',
		title: 'Runtime Systems',
		entries: [
			{
				slug: 'material-system',
				title: 'Material System',
				description:
					'Material contract, uniforms, includes, defines, and deterministic signature behavior.'
			},
			{
				slug: 'texture-system',
				title: 'Texture System',
				description:
					'Texture declarations, update modes, mipmaps, and reactive URL loading with useTexture.'
			},
			{
				slug: 'frame-scheduler',
				title: 'Frame Scheduler and Render Modes',
				description:
					'Task ordering, stage orchestration, render invalidation, and runtime profiling APIs.'
			},
			{
				slug: 'render-passes',
				title: 'Render Passes and Render Targets',
				description:
					'Render graph planning, ping-pong flow, and built-in pass types for post-processing.'
			},
			{
				slug: 'hooks-and-context',
				title: 'Hooks and Context',
				description:
					'Runtime hooks for context access, per-frame updates, texture loading, and advanced user state.'
			}
		]
	},
	{
		id: 'reliability-and-reference',
		title: 'Reliability and Reference',
		entries: [
			{
				slug: 'error-handling-and-diagnostics',
				title: 'Error Handling and Diagnostics',
				description:
					'Normalized error reporting, diagnostics overlay behavior, and known failure classifications.'
			},
			{
				slug: 'api-reference',
				title: 'API Reference',
				description:
					'Complete reference of root and advanced exports, props, and material/runtime APIs.'
			},
			{
				slug: 'examples',
				title: 'Examples',
				description:
					'Practical integration examples for animation loops, on-demand rendering, and pass pipelines.'
			},
			{
				slug: 'use-cases',
				title: 'Use Cases',
				description:
					'Production-oriented patterns for interactive heroes, audio-reactive scenes, and dashboards.'
			},
			{
				slug: 'testing-and-internal-notes',
				title: 'Testing and Internal Notes',
				description: 'Test coverage scope, enforced runtime contracts, and key implementation details.'
			}
		]
	}
];

export const docsManifest: DocEntry[] = docsRouteGroups.flatMap((group) => group.entries);

export const getDocHref = (slug: string) => (slug ? `/docs/${slug}` : '/docs');

export const getDocBySlug = (slug: string) =>
	docsManifest.find((entry) => entry.slug === slug) ?? null;

export const getAdjacentDocs = (slug: string) => {
	const index = docsManifest.findIndex((entry) => entry.slug === slug);
	if (index === -1) {
		return { previous: null, next: null } as const;
	}

	return {
		previous: index > 0 ? docsManifest[index - 1] : null,
		next: index < docsManifest.length - 1 ? docsManifest[index + 1] : null
	} as const;
};
