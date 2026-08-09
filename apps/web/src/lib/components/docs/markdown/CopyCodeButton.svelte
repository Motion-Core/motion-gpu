<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { copyToClipboard } from '$lib/utils/copy';
	import { AppCheckIcon, AppCopyIcon } from '$lib/components/icons';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';

	let { code, class: className }: { code: string; class?: string } = $props();

	let copied = $state(false);
	let lastCode = $state('');

	async function handleCopy(value: string) {
		if (!value) return;
		try {
			await copyToClipboard(value);
			copied = true;
		} catch {
			console.error('Failed to copy code snippet');
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

	// Reset when code changes
	$effect(() => {
		if (code === lastCode) return;
		lastCode = code;
		copied = false;
	});
</script>

<Tooltip content={copied ? 'Code copied' : 'Copy to clipboard'}>
	{#snippet children({ describedBy })}
		<button
			type="button"
			class={cn(
				'focus-ring focus-outline hit-target group inset-shadow relative flex size-7 items-center justify-center rounded-sm bg-background-inset text-foreground transition-[scale,box-shadow] duration-150 ease-out outline-none active:scale-[0.95] motion-reduce:transform-none motion-reduce:transition-none',
				className
			)}
			onclick={(event) => {
				event.stopPropagation();
				event.preventDefault();
				void handleCopy(code);
			}}
			aria-label={copied ? 'Copied code' : 'Copy code'}
			aria-describedby={describedBy}
		>
			<span class="sr-only">{copied ? 'Copied code' : 'Copy code'}</span>
			<span
				class={cn(
					'absolute transition-[opacity,filter,scale] duration-150 ease-out will-change-[opacity,filter,scale] motion-reduce:transform-none motion-reduce:blur-none motion-reduce:transition-none motion-reduce:will-change-auto',
					copied ? 'scale-[0.25] opacity-0 blur-xs' : 'blur-0 scale-100 opacity-100'
				)}
			>
				<AppCopyIcon size={16} />
			</span>
			<span
				class={cn(
					'absolute transition-[opacity,filter,scale] duration-150 ease-out will-change-[opacity,filter,scale] motion-reduce:transform-none motion-reduce:blur-none motion-reduce:transition-none motion-reduce:will-change-auto',
					copied ? 'blur-0 scale-100 opacity-100' : ' scale-[0.25] opacity-0 blur-xs'
				)}
			>
				<AppCheckIcon size={16} />
			</span>
		</button>
	{/snippet}
</Tooltip>
