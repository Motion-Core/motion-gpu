<script setup lang="ts">
import { ref } from 'vue';
import MotionGPUErrorOverlay from '../../../src/lib/vue/MotionGPUErrorOverlay.vue';
import { errorOverlayStyleReport } from '../../error-overlay-style-report';
import '../../error-overlay-host-cascade.css';

const visible = ref(true);
</script>

<template>
	<MotionGPUErrorOverlay
		v-if="visible"
		:report="errorOverlayStyleReport"
		:onDismiss="() => (visible = false)"
	/>
</template>
