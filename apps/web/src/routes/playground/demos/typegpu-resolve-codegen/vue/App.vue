<script setup lang="ts">
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/vue';
	import { fragment } from '../shader';

	const material = defineMaterial({
		fragment
	});
</script>

<template>
<FragCanvas :material="material" outputColorSpace="linear" :dpr="1.0" />
</template>
