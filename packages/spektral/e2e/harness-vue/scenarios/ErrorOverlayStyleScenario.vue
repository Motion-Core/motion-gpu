<script setup lang="ts">
import { ref } from 'vue';
import SpektralErrorOverlay from '../../../src/lib/vue/SpektralErrorOverlay.vue';
import { errorOverlayStyleReport } from '../../error-overlay-style-report';
import '../../error-overlay-host-cascade.css';

const visible = ref(true);
</script>

<template>
	<SpektralErrorOverlay
		v-if="visible"
		:report="errorOverlayStyleReport"
		:onDismiss="() => (visible = false)"
	/>
</template>
