import { useCallback, useRef, useState } from 'react';
import { FragCanvas, useFrame } from '../../../src/lib/react';
import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
import {
	formatStorageWriteReadProofError,
	runStorageWriteReadProof,
	storageWriteReadProofMaterial,
	type StorageWriteReadProofResult
} from '../../storage-write-read-proof';

interface StorageWriteReadProbeProps {
	onComplete: (result: StorageWriteReadProofResult) => void;
	onError: (error: unknown) => void;
}

function StorageWriteReadProbe({ onComplete, onError }: StorageWriteReadProbeProps) {
	const startedRef = useRef(false);
	const runProof = useCallback(
		(frame: Parameters<typeof runStorageWriteReadProof>[0]) => {
			if (startedRef.current) {
				return;
			}

			startedRef.current = true;
			void runStorageWriteReadProof(frame).then(onComplete, onError);
		},
		[onComplete, onError]
	);

	useFrame(runProof, { autoInvalidate: false });
	return null;
}

export function StorageWriteReadScenario() {
	const [status, setStatus] = useState<'pending' | 'complete' | 'failed'>('pending');
	const [values, setValues] = useState<readonly number[]>([]);
	const [mutatedSourceValue, setMutatedSourceValue] = useState<number | null>(null);
	const [errorMessage, setErrorMessage] = useState('none');

	const completeProof = useCallback((result: StorageWriteReadProofResult) => {
		setValues(result.values);
		setMutatedSourceValue(result.mutatedSourceValue);
		setStatus('complete');
	}, []);
	const failProof = useCallback((error: unknown) => {
		setErrorMessage(formatStorageWriteReadProofError(error));
		setStatus('failed');
	}, []);
	const handleMotionGPUError = useCallback(
		(report: MotionGPUErrorReport) => failProof(report.rawMessage),
		[failProof]
	);

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="storage-proof-status">{status}</div>
				<div data-testid="storage-proof-result">{JSON.stringify(values)}</div>
				<div data-testid="storage-proof-mutated-source">{mutatedSourceValue ?? 'none'}</div>
				<div data-testid="storage-proof-error">{errorMessage}</div>
				{status !== 'pending' ? <div data-testid="storage-proof-terminal">{status}</div> : null}
			</section>

			<div className="canvas-shell">
				<FragCanvas
					material={storageWriteReadProofMaterial}
					renderMode="on-demand"
					showErrorOverlay={false}
					onError={handleMotionGPUError}
				>
					<StorageWriteReadProbe onComplete={completeProof} onError={failProof} />
				</FragCanvas>
			</div>
		</main>
	);
}
