<script setup lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import { FragCanvas, useFrame } from '../../../src/lib/vue';
import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
import {
	formatStorageWriteReadProofError,
	runStorageWriteReadProof,
	storageWriteReadProofMaterial,
	type StorageWriteReadProofResult
} from '../../storage-write-read-proof';

const StorageWriteReadProbe = defineComponent({
	props: {
		onComplete: {
			type: Function as PropType<(result: StorageWriteReadProofResult) => void>,
			required: true
		},
		onError: {
			type: Function as PropType<(error: unknown) => void>,
			required: true
		}
	},
	setup(props) {
		let started = false;
		useFrame(
			(frame) => {
				if (started) {
					return;
				}

				started = true;
				void runStorageWriteReadProof(frame).then(props.onComplete, props.onError);
			},
			{ autoInvalidate: false }
		);

		return () => null;
	}
});

const status = ref<'pending' | 'complete' | 'failed'>('pending');
const values = ref<readonly number[]>([]);
const mutatedSourceValue = ref<number | null>(null);
const errorMessage = ref('none');

function completeProof(result: StorageWriteReadProofResult): void {
	values.value = result.values;
	mutatedSourceValue.value = result.mutatedSourceValue;
	status.value = 'complete';
}

function failProof(error: unknown): void {
	errorMessage.value = formatStorageWriteReadProofError(error);
	status.value = 'failed';
}

function handleSpektralError(report: SpektralErrorReport): void {
	failProof(report.rawMessage);
}
</script>

<template>
	<main class="harness-main">
		<section class="harness-controls">
			<div data-testid="storage-proof-status">{{ status }}</div>
			<div data-testid="storage-proof-result">{{ JSON.stringify(values) }}</div>
			<div data-testid="storage-proof-mutated-source">{{ mutatedSourceValue ?? 'none' }}</div>
			<div data-testid="storage-proof-error">{{ errorMessage }}</div>
			<div v-if="status !== 'pending'" data-testid="storage-proof-terminal">{{ status }}</div>
		</section>

		<div class="canvas-shell">
			<FragCanvas
				:material="storageWriteReadProofMaterial"
				renderMode="on-demand"
				:showErrorOverlay="false"
				:onError="handleSpektralError"
			>
				<StorageWriteReadProbe :onComplete="completeProof" :onError="failProof" />
			</FragCanvas>
		</div>
	</main>
</template>
