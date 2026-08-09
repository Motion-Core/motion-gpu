<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import AppIcon from './AppIcon.svelte';
	import { assemblyIcon } from './app-icon-data';

	let { ...props }: Omit<ComponentProps<typeof AppIcon>, 'icon'> = $props();
</script>

<AppIcon icon={assemblyIcon} {...props} />
