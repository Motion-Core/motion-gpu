<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import { copyToClipboard } from '$lib/utils/copy';

	import { AppCheckIcon, AppCopyIcon } from '$lib/components/icons';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';

	type ComponentProps = {
		id?: string;
		class?: string;
		children?: Snippet;
		[prop: string]: unknown;
	};

	const { children, id, class: className = '', ...restProps }: ComponentProps = $props();

	let copied = $state(false);

	async function copyHeadingUrl(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		if (!id || typeof window === 'undefined') return;

		const hash = `#${encodeURIComponent(id)}`;
		const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;

		window.history.pushState(null, '', hash);

		try {
			await copyToClipboard(url);
			copied = true;
		} catch (error) {
			console.error('Failed to copy heading link', error);
		}
	}

	// Reset the copied state after 2 seconds
	$effect(() => {
		if (!copied) return;
		const t = setTimeout(() => {
			copied = false;
		}, 2000);
		return () => {
			clearTimeout(t);
		};
	});
</script>

<h2
	{id}
	{...restProps}
	class={cn(
		'group mt-12 w-fit scroll-m-24 text-2xl font-medium tracking-tight text-foreground [&_code]:text-xl',
		className
	)}
>
	<span class="inline-flex items-center gap-2 align-baseline leading-none">
		<span class="min-w-0 [&_a]:text-2xl">
			{@render children?.()}
		</span>

		{#if id}
			<span
				class="card-outer flex items-center rounded-sm p-1 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
			>
				<Tooltip>
					{#snippet tooltip()}
						{copied ? 'Heading link copied' : 'Copy heading link'}
					{/snippet}
					{#snippet children({ describedBy })}
						<button
							type="button"
							class={cn(
								'focus-ring focus-outline hit-target relative inline-flex size-6 shrink-0 items-center justify-center rounded-[calc(var(--radius-base)*1.25)] bg-background text-foreground card transition-[scale,box-shadow] duration-150 ease-out outline-none active:scale-[0.95] motion-reduce:transform-none motion-reduce:transition-none'
							)}
							onclick={copyHeadingUrl}
							aria-label={copied ? 'Heading link copied' : 'Copy heading link'}
							aria-describedby={describedBy}
						>
							<span
								class={cn(
									'absolute inline-flex items-center justify-center transition-[opacity,filter,scale] duration-150 ease-out will-change-[opacity,filter,scale] motion-reduce:transform-none motion-reduce:blur-none motion-reduce:transition-none motion-reduce:will-change-auto',
									copied ? 'scale-[0.25] opacity-0 blur-xs' : 'blur-0 scale-100 opacity-100'
								)}
							>
								<AppCopyIcon size={16} />
							</span>

							<span
								class={cn(
									'absolute inline-flex items-center justify-center transition-[opacity,filter,scale] duration-150 ease-out will-change-[opacity,filter,scale] motion-reduce:transform-none motion-reduce:blur-none motion-reduce:transition-none motion-reduce:will-change-auto',
									copied ? 'blur-0 scale-100 opacity-100' : 'scale-[0.25] opacity-0 blur-xs'
								)}
							>
								<AppCheckIcon size={16} />
							</span>
						</button>
					{/snippet}
				</Tooltip>
			</span>
		{/if}
	</span>
</h2>
