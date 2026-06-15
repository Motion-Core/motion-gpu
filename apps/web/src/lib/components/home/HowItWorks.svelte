<script lang="ts">
	import {
		Alert01Icon,
		CodeIcon,
		DatabaseZapIcon,
		FlowConnectionIcon,
		ThreeDViewIcon,
		TouchInteraction01Icon
	} from '@hugeicons/core-free-icons';
	import AppHugeIcon from '$lib/components/app-icons/AppHugeIcon.svelte';
	import Section from './Section.svelte';
	import Card from './Card.svelte';
	import InsetShadowContainer from './InsetShadowContainer.svelte';
	import Badge from '../ui/Badge.svelte';

	type Step = {
		number: string;
		title: string;
		description: string;
		icon: 'material' | 'inputs' | 'runtime' | 'passes' | 'diagnostics';
	};

	const steps: Step[] = [
		{
			number: '01',
			title: 'Define Material',
			description:
				'Start with a strict fragment contract and a deterministic material definition that can be rebuilt safely.',
			icon: 'material'
		},
		{
			number: '02',
			title: 'Declare Inputs',
			description:
				'Attach typed uniforms, textures, defines, and includes so runtime data stays explicit and verifiable.',
			icon: 'inputs'
		},
		{
			number: '03',
			title: 'Drive Runtime State',
			description:
				'Use useFrame and context APIs to update uniforms or textures with deterministic scheduling behavior.',
			icon: 'runtime'
		},
		{
			number: '04',
			title: 'Compose Passes',
			description:
				'Chain ShaderPass, BlitPass, and CopyPass with render targets to build post-processing pipelines.',
			icon: 'passes'
		},
		{
			number: '05',
			title: 'Inspect and Tune',
			description:
				'Use normalized errors and scheduler diagnostics to debug quickly and tighten frame-time budgets.',
			icon: 'diagnostics'
		}
	];

	const leftColumnSteps = steps.filter((_, index) => index % 2 === 0);
	const rightColumnSteps = steps.filter((_, index) => index % 2 === 1);
</script>

<Section
	variant="default"
	id="how-it-works"
	class="flex flex-col items-center justify-center gap-4"
>
	<Badge>
		<span class="flex items-center gap-1.5">
			<AppHugeIcon icon={FlowConnectionIcon} class="text-accent" size={16} />
			<span>How It Works</span>
		</span>
	</Badge>
	<h2
		class="text-center text-2xl font-medium tracking-tight text-balance text-foreground sm:text-4xl"
	>
		A transparent pipeline from start to finish
	</h2>
	<p
		class="text-center text-base font-normal tracking-normal text-pretty text-foreground-muted sm:w-1/2"
	>
		From first shader line to production diagnostics, each step keeps rendering behavior explicit
		and composable.
	</p>

	<InsetShadowContainer class="mt-8">
		{#snippet stepCard(step: Step)}
			<Card number={step.number} title={step.title} description={step.description}>
				{#snippet icon()}
					{#if step.icon === 'material'}
						<AppHugeIcon icon={CodeIcon} size={32} />
					{:else if step.icon === 'inputs'}
						<AppHugeIcon icon={DatabaseZapIcon} size={32} />
					{:else if step.icon === 'runtime'}
						<AppHugeIcon icon={TouchInteraction01Icon} size={32} />
					{:else if step.icon === 'passes'}
						<AppHugeIcon icon={ThreeDViewIcon} size={32} />
					{:else}
						<AppHugeIcon icon={Alert01Icon} size={32} />
					{/if}
				{/snippet}
			</Card>
		{/snippet}

		{@const typedStepCard = stepCard as import('svelte').Snippet<[Step]>}

		<div class="space-y-2 sm:hidden">
			{#each steps as step (step.number)}
				{@render typedStepCard(step)}
			{/each}
		</div>

		<div class="hidden items-start gap-2 sm:grid sm:grid-cols-2">
			<div class="space-y-2">
				{#each leftColumnSteps as step (step.number)}
					{@render typedStepCard(step)}
				{/each}
			</div>

			<div class="space-y-2 pt-36">
				{#each rightColumnSteps as step (step.number)}
					{@render typedStepCard(step)}
				{/each}
			</div>
		</div>
	</InsetShadowContainer>
</Section>
