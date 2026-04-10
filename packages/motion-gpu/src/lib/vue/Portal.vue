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
 * Resolves a teleport target to a concrete DOM element, falling back to body.
 */
function resolveTargetElement(
	input: string | HTMLElement | null | undefined
): HTMLElement | string {
	if (typeof input === 'string') {
		if (typeof document === 'undefined') {
			return input;
		}

		return document.querySelector<HTMLElement>(input) ?? document.body;
	}

	if (input) {
		return input;
	}

	return typeof document === 'undefined' ? 'body' : document.body;
}

const teleportTarget = computed(() => resolveTargetElement(props.target));
</script>

<template>
	<Teleport :to="teleportTarget">
		<div class="motiongpu-portal-root">
			<slot />
		</div>
	</Teleport>
</template>
