<script setup lang="ts">
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
} from '@motion-core/motion-gpu/vue/advanced';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

void setMotionGPUUserContext;
void useMotionGPUUserContext;
</script>

<template>
	<FragCanvas :material="material" />
</template>
