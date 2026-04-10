<script setup lang="ts">
import { computed } from 'vue';

interface Props {
	target?: string | HTMLElement | null;
}

const props = withDefaults(defineProps<Props>(), {
	target: 'body'
});

defineSlots<{
	default(): unknown;
}>();

/**
 * Resolves a teleport target to a DOM element, falling back to `document.body`.
 */
function resolveTargetElement(input: string | HTMLElement | null | undefined): HTMLElement | string {
	if (typeof input === 'string') {
		return input;
	}

	if (input) {
		return input;
	}

	return 'body';
}

const teleportTarget = computed(() => resolveTargetElement(props.target));
</script>

<template>
	<Teleport :to="teleportTarget">
		<slot />
	</Teleport>
</template>
