<script lang="ts">
	import { onMount } from 'svelte';
	import LogoReact from 'carbon-icons-svelte/lib/LogoReact.svelte';
	import LogoSvelte from 'carbon-icons-svelte/lib/LogoSvelte.svelte';
	import LogoVue from 'carbon-icons-svelte/lib/LogoVue.svelte';
	import { cn } from '$lib/utils/cn';
	import CopyCodeButton from './markdown/CopyCodeButton.svelte';
	import ShikiCodeBlock from './ShikiCodeBlock.svelte';
	import { getHighlighter } from '$lib/utils/highlighter';
	import { frameworkStore, frameworks, type Framework } from '$lib/stores/framework.svelte';

	type Props = {
		svelteCode: string;
		reactCode: string;
		vueCode: string;
		svelteLang?: string;
		reactLang?: string;
		vueLang?: string;
	};

	let {
		svelteCode,
		reactCode,
		vueCode,
		svelteLang = 'svelte',
		reactLang = 'tsx',
		vueLang = 'vue'
	}: Props = $props();

	let isReady = $state(false);

	type HighlightedCode = { light: string; dark: string } | null;
	let highlighted = $state<Record<Framework, HighlightedCode>>({ svelte: null, react: null, vue: null });

	const codeMap: Record<Framework, string> = $derived({
		svelte: svelteCode,
		react: reactCode,
		vue: vueCode
	});
	const activeCode = $derived(codeMap[frameworkStore.active]);

	$effect(() => {
		const toHighlight: Record<Framework, { code: string; lang: string }> = {
			svelte: { code: svelteCode, lang: svelteLang },
			react: { code: reactCode, lang: reactLang },
			vue: { code: vueCode, lang: vueLang }
		};

		getHighlighter().then((highlighter) => {
			for (const fw of frameworks) {
				const { code, lang } = toHighlight[fw];
				highlighted[fw] = {
					light: highlighter.codeToHtml(code, { lang, theme: 'github-light' }),
					dark: highlighter.codeToHtml(code, { lang, theme: 'github-dark' })
				};
			}
		});
	});

	onMount(() => {
		isReady = true;
	});
</script>

<div
	data-framework-block
	data-ready={isReady ? 'true' : 'false'}
	class="inset-shadow my-6 rounded-lg bg-background-inset p-1.5"
>
	<div class="card relative w-full rounded-md bg-background">
		<div class="flex items-center justify-between rounded-t-md border-b border-border">
			<div class="flex items-center">
				{#each frameworks as fw (fw)}
					<button
						onclick={() => (frameworkStore.active = fw)}
						class={cn(
							'relative px-4 py-2.5 text-sm font-medium tracking-normal transition-colors duration-150 ease-out outline-none select-none',
							frameworkStore.active === fw
								? 'text-foreground'
								: 'text-foreground-muted hover:text-foreground'
						)}
					>
						<span class="inline-flex items-center gap-1.5">
							{#if fw === 'svelte'}
								<LogoSvelte size={16} />
								<span>Svelte</span>
							{:else if fw === 'react'}
								<LogoReact size={16} />
								<span>React</span>
							{:else}
								<LogoVue size={16} />
								<span>Vue</span>
							{/if}
						</span>
						{#if frameworkStore.active === fw}
							<div class="absolute bottom-0 left-0 h-0.5 w-full bg-accent"></div>
						{/if}
					</button>
				{/each}
			</div>
			<CopyCodeButton code={activeCode} class="mr-2" />
		</div>
		<div
			class="min-h-12.5 p-4 [&>div]:mt-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none [&>div]:[box-shadow:none]!"
		>
			{#if highlighted[frameworkStore.active]}
				<ShikiCodeBlock
					code=""
					htmlLight={highlighted[frameworkStore.active]!.light}
					htmlDark={highlighted[frameworkStore.active]!.dark}
					unstyled={true}
				/>
			{:else}
				<code class="block font-mono text-sm leading-relaxed whitespace-pre text-foreground">
					{activeCode}
				</code>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.js [data-framework-block]:not([data-ready='true'])) {
		visibility: hidden;
	}
</style>
