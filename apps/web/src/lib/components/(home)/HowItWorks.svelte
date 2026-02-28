<script lang="ts">
	import Badge from '../ui/Badge.svelte';
	import Code from 'carbon-icons-svelte/lib/Code.svelte';
	import DataEnrichment from 'carbon-icons-svelte/lib/DataEnrichment.svelte';
	import Touch_1Down from 'carbon-icons-svelte/lib/Touch_1Down.svelte';
	import ModelAlt from 'carbon-icons-svelte/lib/ModelAlt.svelte';
	import WarningAlt from 'carbon-icons-svelte/lib/WarningAlt.svelte';
	import LandingSection from './LandingSection.svelte';

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
</script>

<LandingSection id="how-it-works">
	<div class="flex w-full flex-col items-start justify-center gap-6">
		<Badge>How It Works</Badge>
		<div class="grid w-full grid-cols-3 gap-3">
			<h2
				class="col-span-3 max-w-2xl text-2xl tracking-tight text-balance sm:col-span-2 sm:text-5xl"
			>
				<span class="block">A transparent pipeline.</span>
				<span class="block">Step by step.</span>
			</h2>
			<p class="col-span-3 font-fono text-sm text-foreground-muted sm:col-span-1">
				From first shader line to production diagnostics, each step keeps rendering behavior
				explicit and composable.
			</p>
		</div>
	</div>

	<div class="relative mt-6 w-full sm:mt-12">
		<div
			aria-hidden="true"
			class="absolute top-0 bottom-0 left-5 w-px bg-background-muted sm:left-1/2 sm:-translate-x-1/2"
		></div>

		<div class="grid gap-6">
			{#each steps as step, index (step.number)}
				<div class="relative grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-6">
					<div
						class={index % 2 === 0
							? 'pl-14 sm:col-start-1 sm:pl-0'
							: 'pl-14 sm:col-start-3 sm:pl-0'}
					>
						<article class="grid min-h-72 bg-background p-4 sm:p-8">
							<div class="flex items-start justify-between">
								<div class="grid size-12 place-items-center bg-accent text-foreground">
									{#if step.icon === 'material'}
										<Code size={24} />
									{:else if step.icon === 'inputs'}
										<DataEnrichment size={24} />
									{:else if step.icon === 'runtime'}
										<Touch_1Down size={24} />
									{:else if step.icon === 'passes'}
										<ModelAlt size={24} />
									{:else}
										<WarningAlt size={24} />
									{/if}
								</div>
								<div class="bg-background-muted px-6 py-2 font-fono text-sm">
									{step.number}
								</div>
							</div>

							<div class="mt-auto grid gap-4">
								<h3 class="text-xl tracking-tight sm:text-2xl">{step.title}</h3>
								<p class="font-fono text-sm text-foreground-muted">{step.description}</p>
							</div>
						</article>
					</div>

					<div
						class="absolute top-0 left-5 grid size-3 -translate-x-1/2 place-items-center rounded-full border border-foreground/20 bg-background sm:left-1/2 sm:-translate-x-1/2"
					>
						<div class="size-1.5 rounded-full bg-foreground/50"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</LandingSection>
