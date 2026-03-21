import {
	createCurrentWritable as currentWritable,
	type CurrentReadable
} from '../core/current-value.js';
import type { LoadedTexture, TextureLoadOptions } from '../core/texture-loader.js';
import type { MotionGPUErrorReport } from '../core/error-report.js';

/**
 * Reactive state returned by `useTexture`.
 */
export interface UseTextureResult {
	textures: CurrentReadable<LoadedTexture[] | null>;
	loading: CurrentReadable<boolean>;
	error: CurrentReadable<Error | null>;
	errorReport: CurrentReadable<MotionGPUErrorReport | null>;
	reload: () => Promise<void>;
}

/**
 * Supported URL input variants for `useTexture`.
 */
export type TextureUrlInput = string[] | (() => string[]);

/**
 * React implementation placeholder. Full runtime wiring is implemented in a follow-up step.
 */
export function useTexture(
	_urlInput: TextureUrlInput,
	options: TextureLoadOptions = {}
): UseTextureResult {
	void options;
	const textures = currentWritable<LoadedTexture[] | null>(null);
	const loading = currentWritable(false);
	const error = currentWritable<Error | null>(null);
	const errorReport = currentWritable<MotionGPUErrorReport | null>(null);

	return {
		textures,
		loading,
		error,
		errorReport,
		reload: async () => {
			throw new Error('useTexture is not implemented yet');
		}
	};
}
