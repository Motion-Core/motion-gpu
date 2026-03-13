import type { OutputChunk, RollupError } from '@rollup/browser';
import type { CompileError } from 'svelte/compiler';

export type PlaygroundFile = {
	type: 'file';
	name: string;
	basename: string;
	contents: string;
	text: true;
};

export interface BundleResult {
	uid: number;
	error: (RollupError & CompileError) | null;
	client: OutputChunk | null;
	css: string | null;
}

export interface BundleStatusMessage {
	type: 'status';
	message: string;
}

export interface BundleVersionMessage {
	type: 'version';
	version: string;
	supports_async: boolean;
}

export interface BundleErrorMessage {
	type: 'error';
	uid: number;
	message: string;
}
