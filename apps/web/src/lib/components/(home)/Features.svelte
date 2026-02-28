<script lang="ts">
	import Badge from '../ui/Badge.svelte';
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

<section class="flex w-full flex-col items-start justify-start bg-card p-4 sm:p-8">
	<div class="flex w-full flex-col items-start justify-center gap-6">
		<Badge>Features</Badge>
		<div class="grid grid-cols-3 gap-3">
			<h2
				class="col-span-3 max-w-2xl text-2xl tracking-tight text-balance sm:col-span-2 sm:text-5xl"
			>
				<span class="block">Strict contracts.</span>
				<span class="block">Predictable rendering.</span>
			</h2>
			<p class="col-span-3 font-fono text-sm sm:col-span-1">
				From a single fullscreen fragment shader to multi-pass effects, Motion GPU gives you strict
				contracts and predictable runtime behavior.
			</p>
		</div>
	</div>
	<div class="mt-12 grid w-full grid-cols-1 gap-6 sm:mt-24 xl:grid-cols-3">
		{#each cards as card (card.number)}
			<article class="grid min-h-72 bg-background p-4 sm:min-h-96 sm:p-8">
				<div class="flex items-start justify-between">
					<div class="grid size-12 place-items-center bg-accent/80 text-foreground">
						{#if card.icon === 'chart'}
							<Blockchain size={24} />
						{:else if card.icon === 'stack'}
							<Layers size={24} />
						{:else}
							<Chart_3D size={24} />
						{/if}
					</div>
					<div class="bg-background-muted px-6 py-2 font-fono text-sm">
						{card.number}
					</div>
				</div>

				<div class="mt-auto grid gap-4">
					<h3 class="text-xl tracking-tight sm:text-2xl">{card.title}</h3>
					<p class="font-fono text-sm leading-relaxed">{card.description}</p>
				</div>
			</article>
		{/each}
	</div>
</section>
