<script setup lang="ts">
import { FragCanvas, defineMaterial } from 'spektral/vue';
import { setSpektralUserContext, useSpektralUserContext } from 'spektral/vue/advanced';

const material = defineMaterial({
	fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
});

void setSpektralUserContext;
void useSpektralUserContext;
</script>

<template>
	<FragCanvas :material="material" />
</template>
