<script lang="ts">
	import { useFrame } from '../../../src/lib/svelte/frame-context';
	import {
		runStorageWriteReadProof,
		type StorageWriteReadProofResult
	} from '../../storage-write-read-proof';

	interface Props {
		onComplete: (result: StorageWriteReadProofResult) => void;
		onError: (error: unknown) => void;
	}

	let { onComplete, onError }: Props = $props();
	let started = false;

	useFrame(
		(frame) => {
			if (started) {
				return;
			}

			started = true;
			void runStorageWriteReadProof(frame).then(onComplete, onError);
		},
		{ autoInvalidate: false }
	);
</script>
