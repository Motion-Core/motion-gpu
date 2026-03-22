import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useMotionGPU } from '../../src/lib/react';
import type { RenderMode } from '../../src/lib/core/types';

export interface RuntimeControls {
	setRenderMode: (mode: RenderMode) => void;
	invalidate: () => void;
	advance: () => void;
}

interface RuntimeProbeProps {
	onFrame: (count: number) => void;
	onReady: (controls: RuntimeControls) => void;
}

export function RuntimeProbe({ onFrame, onReady }: RuntimeProbeProps) {
	const context = useMotionGPU();
	const frameCountRef = useRef(0);
	const onFrameRef = useRef(onFrame);

	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	const handleFrame = useCallback(() => {
		frameCountRef.current += 1;
		onFrameRef.current(frameCountRef.current);
	}, []);

	useFrame(handleFrame, { autoInvalidate: false });

	useEffect(() => {
		onReady({
			setRenderMode: (mode) => context.renderMode.set(mode),
			invalidate: context.invalidate,
			advance: context.advance
		});
	}, [context, onReady]);

	return null;
}
