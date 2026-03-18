<script lang="ts">
	import Add from 'carbon-icons-svelte/lib/Add.svelte';
	import Help from 'carbon-icons-svelte/lib/Help.svelte';
	import { slide } from 'svelte/transition';
	import Badge from '../ui/Badge.svelte';
	import InsetShadowContainer from './InsetShadowContainer.svelte';
	import Section from './Section.svelte';

	type FaqItem = {
		question: string;
		answer: string;
	};

	const faqItems: FaqItem[] = [
		{
			question: 'What is Motion GPU?',
			answer:
				'Motion GPU is a Svelte-first WebGPU library for building fast fullscreen shader visuals. It gives you a clean path from a single effect to a complete GPU-driven visual layer in your app.'
		},
		{
			question: 'Who is it for?',
			answer:
				'It is built for developers who want modern, high-performance visual effects in Svelte without building a rendering stack from scratch.'
		},
		{
			question: 'Do I need WebGPU knowledge to use it?',
			answer:
				'No. You can start with a minimal shader and iterate quickly. As your project grows, MotionGPU still gives you full control over uniforms, textures, render flow, and post-processing.'
		},
		{
			question: 'How quickly can I ship something with it?',
			answer:
				'You can usually get a first visual running in minutes: install, define a material, mount FragCanvas, then tune in the playground and docs.'
		},
		{
			question: 'Is it production-friendly?',
			answer:
				'Yes. Motion GPU is designed for predictable behavior, explicit runtime control, and clear diagnostics so teams can move from prototype to production with confidence.'
		},
		{
			question: 'Is this a general 3D engine?',
			answer:
				'No. Motion GPU focuses on fullscreen fragment workflows and post-processing pipelines. If you need full scene graphs and 3D tooling, pair it with a dedicated 3D engine.'
		},
		{
			question: 'Where should I start first?',
			answer:
				'Start with the Playground for instant feedback, then follow Getting Started to move into real app code and production patterns.'
		}
	];

	let openItems = $state<Record<string, boolean>>({});

	const isOpen = (question: string): boolean => openItems[question] ?? false;

	function toggle(question: string) {
		openItems[question] = !isOpen(question);
	}
</script>

<Section variant="muted" id="faq" class="flex flex-col items-center justify-center gap-4">
	<Badge>
		<span class="flex items-center gap-1.5">
			<Help class="text-accent" size={16} />
			<span>FAQ</span>
		</span>
	</Badge>
	<h2
		class="text-center text-2xl font-medium tracking-tight text-balance text-foreground sm:text-4xl"
	>
		Common questions before you build.
	</h2>
	<p
		class="text-center text-base font-normal tracking-normal text-pretty text-foreground-muted sm:w-1/2"
	>
		A quick introduction to what MotionGPU is, who it is for, and how to begin.
	</p>

	<InsetShadowContainer class="mt-8">
		<div class="grid gap-2">
			{#each faqItems as item, index (item.question)}
				<div
					data-reveal="card"
					class="inset-shadow relative overflow-hidden rounded-lg border border-border bg-background-inset p-1"
				>
					<article class="rounded-md border border-border bg-background shadow-md">
						<button
							type="button"
							id={`faq-trigger-${index}`}
							class="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left text-base text-foreground sm:px-6"
							aria-expanded={isOpen(item.question)}
							aria-controls={`faq-panel-${index}`}
							onclick={() => toggle(item.question)}
						>
							<span class="font-medium tracking-tight">{item.question}</span>
							<span
								aria-hidden="true"
								class="inset-shadow inline-flex rounded-sm border border-border bg-background-inset p-1 text-foreground-muted"
							>
								<div
									class:rotate-45={isOpen(item.question)}
									class="transition-transform duration-150"
								>
									<Add size={24} />
								</div>
							</span>
						</button>
						{#if isOpen(item.question)}
							<div
								id={`faq-panel-${index}`}
								role="region"
								aria-labelledby={`faq-trigger-${index}`}
								class="px-4 pb-4 sm:px-6"
								transition:slide={{ duration: 220 }}
							>
								<p
									class="text-sm font-normal tracking-normal text-pretty text-foreground-muted sm:text-base"
								>
									{item.answer}
								</p>
							</div>
						{/if}
					</article>
				</div>
			{/each}
		</div>
	</InsetShadowContainer>
</Section>
