<script lang="ts">
	import Section from './Section.svelte';
	import Card from './Card.svelte';
	import InsetShadowContainer from './InsetShadowContainer.svelte';
	import {
		Alert01Icon,
		ThreeDMoveIcon,
		Blockchain01Icon,
		GridViewIcon,
		Layers01Icon
	} from '@hugeicons/core-free-icons';
	import AppHugeIcon from '$lib/components/app-icons/AppHugeIcon.svelte';
	import Badge from '../ui/Badge.svelte';

	type FeatureCard = {
		title: string;
		description: string;
		icon: 'chart' | 'stack' | 'pulse' | 'diagnostics';
	};

	const cards: FeatureCard[] = [
		{
			title: 'Material Contracts',
			description:
				'Define WGSL materials with strict validation for uniforms, textures, includes, and defines before runtime surprises happen.',
			icon: 'chart'
		},
		{
			title: 'Frame Scheduling',
			description:
				'Orchestrate deterministic frame flow with explicit ordering, stages, and invalidation behavior tailored to your scene.',
			icon: 'stack'
		},
		{
			title: 'Post Processing',
			description:
				'Compose render passes and named render targets to scale from one fullscreen shader to full visual pipelines.',
			icon: 'pulse'
		},
		{
			title: 'Error Diagnostics',
			description:
				'Normalize WebGPU and WGSL failures into structured reports with source snippets, actionable hints, and production-ready error handling.',
			icon: 'diagnostics'
		}
	];
</script>

<Section variant="muted" id="features" class="flex flex-col items-center justify-center gap-4">
	<Badge>
		<span class="flex items-center gap-1.5">
			<AppHugeIcon icon={GridViewIcon} class="text-accent" size={16} />
			<span>Features</span>
		</span>
	</Badge>
	<h2
		class="text-center text-2xl font-medium tracking-tight text-balance text-foreground sm:text-4xl"
	>
		Strict contracts for deterministic rendering
	</h2>
	<p
		class="text-center text-base font-normal tracking-normal text-pretty text-foreground-muted sm:w-1/2"
	>
		From a single fullscreen fragment shader to multi-pass effects, Motion GPU gives you strict
		contracts and deterministic runtime behavior.
	</p>
	<InsetShadowContainer class="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
		{#each cards as card (card.title)}
			<Card title={card.title} description={card.description}>
				{#snippet icon()}
					{#if card.icon === 'chart'}
						<AppHugeIcon icon={Blockchain01Icon} size={32} />
					{:else if card.icon === 'stack'}
						<AppHugeIcon icon={Layers01Icon} size={32} />
					{:else if card.icon === 'pulse'}
						<AppHugeIcon icon={ThreeDMoveIcon} size={32} />
					{:else}
						<AppHugeIcon icon={Alert01Icon} size={32} />
					{/if}
				{/snippet}
			</Card>
		{/each}
	</InsetShadowContainer>
</Section>
