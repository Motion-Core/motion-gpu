<script lang="ts">
	import { cn } from '$lib/utils/cn';

	type ComponentProps = Record<string, unknown> & { class?: string };
	const { class: className = '', ...restProps }: ComponentProps = $props();
</script>

<hr {...restProps} class={cn('h-px border-0 guide-duotone', className)} />
