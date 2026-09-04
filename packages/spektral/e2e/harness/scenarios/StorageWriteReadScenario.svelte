<script lang="ts">
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import type { SpektralErrorReport } from '../../../src/lib/core/error-report';
	import {
		formatStorageWriteReadProofError,
		storageWriteReadProofMaterial,
		type StorageWriteReadProofResult
	} from '../../storage-write-read-proof';
	import StorageWriteReadProbe from './StorageWriteReadProbe.svelte';

	let status = $state<'pending' | 'complete' | 'failed'>('pending');
	let values = $state<readonly number[]>([]);
	let mutatedSourceValue = $state<number | null>(null);
	let errorMessage = $state('none');

	function completeProof(result: StorageWriteReadProofResult): void {
		values = result.values;
		mutatedSourceValue = result.mutatedSourceValue;
		status = 'complete';
	}

	function failProof(error: unknown): void {
		errorMessage = formatStorageWriteReadProofError(error);
		status = 'failed';
	}

	function handleSpektralError(report: SpektralErrorReport): void {
		failProof(report.rawMessage);
	}
</script>

<main>
	<section>
		<div data-testid="storage-proof-status">{status}</div>
		<div data-testid="storage-proof-result">{JSON.stringify(values)}</div>
		<div data-testid="storage-proof-mutated-source">{mutatedSourceValue ?? 'none'}</div>
		<div data-testid="storage-proof-error">{errorMessage}</div>
		{#if status !== 'pending'}
			<div data-testid="storage-proof-terminal">{status}</div>
		{/if}
	</section>

	<div class="canvas-shell">
		<FragCanvas
			material={storageWriteReadProofMaterial}
			renderMode="on-demand"
			showErrorOverlay={false}
			onError={handleSpektralError}
		>
			<StorageWriteReadProbe onComplete={completeProof} onError={failProof} />
		</FragCanvas>
	</div>
</main>

<style>
	main {
		font-family: sans-serif;
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	section {
		display: grid;
		gap: 0.5rem;
	}

	.canvas-shell {
		width: 320px;
		height: 220px;
		border: 1px solid #d0d0d0;
	}
</style>
