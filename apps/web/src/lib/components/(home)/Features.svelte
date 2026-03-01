<script lang="ts">
	import LandingSection from './LandingSection.svelte';
	import LandingSectionHeader from './LandingSectionHeader.svelte';
	import Layers from 'carbon-icons-svelte/lib/Layers.svelte';
	import Blockchain from 'carbon-icons-svelte/lib/Blockchain.svelte';
	import Chart_3D from 'carbon-icons-svelte/lib/Chart_3D.svelte';

	type FeatureCard = {
		number: string;
		title: string;
		description: string;
		icon: 'chart' | 'stack' | 'pulse';
	};

	const cards: FeatureCard[] = [
		{
			number: '01',
			title: 'Material Contracts',
			description:
				'Define WGSL materials with strict validation for uniforms, textures, includes, and defines before runtime surprises happen.',
			icon: 'chart'
		},
		{
			number: '02',
			title: 'Frame Scheduling',
			description:
				'Orchestrate deterministic frame flow with explicit ordering, stages, and invalidation behavior tailored to your scene.',
			icon: 'stack'
		},
		{
			number: '03',
			title: 'Post Processing',
			description:
				'Compose render passes and named render targets to scale from one fullscreen shader to full visual pipelines.',
			icon: 'pulse'
		}
	];
</script>

<LandingSection id="features">
	<LandingSectionHeader
		badge="Features"
		description="From a single fullscreen fragment shader to multi-pass effects, MotionGPU gives you strict contracts and deterministic runtime behavior."
		gridClass="grid w-full grid-cols-3 gap-3"
	>
		<span class="block">Strict contracts.</span>
		<span class="block">Deterministic rendering.</span>
	</LandingSectionHeader>
	<div class="mt-6 grid w-full grid-cols-1 gap-6 sm:mt-12 xl:grid-cols-3">
		{#each cards as card (card.number)}
			<article class="grid min-h-72 border border-border bg-background p-4 sm:p-8">
				<div class="flex items-start justify-between">
					<div class="grid size-12 place-items-center text-foreground">
						{#if card.icon === 'chart'}
							<Blockchain size={32} />
						{:else if card.icon === 'stack'}
							<Layers size={32} />
						{:else}
							<Chart_3D size={32} />
						{/if}
					</div>
					<div class="border border-border bg-background-muted px-6 py-2 font-mono text-sm">
						{card.number}
					</div>
				</div>

				<div class="mt-auto grid gap-4">
					<h3 class="text-xl tracking-tight sm:text-2xl">{card.title}</h3>
					<p class="text-base text-foreground-muted">{card.description}</p>
				</div>
			</article>
		{/each}
	</div>
</LandingSection>
