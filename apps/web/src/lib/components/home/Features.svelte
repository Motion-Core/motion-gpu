<script lang="ts">
	import Section from './Section.svelte';
	import Card from './Card.svelte';
	import InsetShadowContainer from './InsetShadowContainer.svelte';
	import Layers from 'carbon-icons-svelte/lib/Layers.svelte';
	import DataViewAlt from 'carbon-icons-svelte/lib/DataViewAlt.svelte';
	import Blockchain from 'carbon-icons-svelte/lib/Blockchain.svelte';
	import Chart_3D from 'carbon-icons-svelte/lib/Chart_3D.svelte';
	import Badge from '../ui/Badge.svelte';

	type FeatureCard = {
		title: string;
		description: string;
		icon: 'chart' | 'stack' | 'pulse';
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
		}
	];
</script>

<Section variant="muted" id="features" class="flex flex-col items-center justify-center gap-4">
	<Badge>
		<span class="flex items-center gap-1.5">
			<DataViewAlt size={16} />
			<span>Features</span>
		</span>
	</Badge>
	<h2 class="text-center text-2xl tracking-tight text-balance text-foreground sm:text-4xl">
		Strict contracts. Deterministic rendering.
	</h2>
	<p class="text-center text-base text-pretty text-foreground-muted sm:w-1/2">
		From a single fullscreen fragment shader to multi-pass effects, MotionGPU gives you strict
		contracts and deterministic runtime behavior.
	</p>
	<InsetShadowContainer class="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
		{#each cards as card (card.title)}
			<Card title={card.title} description={card.description}>
				{#snippet icon()}
					{#if card.icon === 'chart'}
						<Blockchain size={32} />
					{:else if card.icon === 'stack'}
						<Layers size={32} />
					{:else}
						<Chart_3D size={32} />
					{/if}
				{/snippet}
			</Card>
		{/each}
	</InsetShadowContainer>
</Section>
