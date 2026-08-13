import { onDestroy, onMount } from 'svelte';
import { type CurrentReadable } from '../core/current-value.js';
import { createTextureLoadController } from '../core/texture-load-controller.js';
import { type LoadedTexture, type TextureLoadOptions } from '../core/texture-loader.js';
import { type MotionGPUErrorReport } from '../core/error-report.js';

/**
 * Reactive state returned by {@link useTexture}.
 */
export interface UseTextureResult {
	/**
	 * Loaded textures or `null` when unavailable/failed.
	 */
	textures: CurrentReadable<LoadedTexture[] | null>;
	/**
	 * `true` while an active load request is running.
	 */
	loading: CurrentReadable<boolean>;
	/**
	 * Last loading error.
	 */
	error: CurrentReadable<Error | null>;
	/**
	 * Last loading error normalized to MotionGPU diagnostics report shape.
	 */
	errorReport: CurrentReadable<MotionGPUErrorReport | null>;
	/**
	 * Reloads all textures using current URL input.
	 */
	reload: () => Promise<void>;
}

/**
 * Supported URL input variants for `useTexture`.
 */
export type TextureUrlInput = string[] | (() => string[]);

/**
 * Supported options input variants for `useTexture`.
 */
export type TextureOptionsInput = TextureLoadOptions | (() => TextureLoadOptions);

/**
 * Loads textures from URLs and exposes reactive loading/error state.
 *
 * @param urlInput - URLs array or lazy URL provider.
 * @param optionsInput - Loader options object or lazy options provider.
 * @returns Reactive texture loading state with reload support.
 */
export function useTexture(
	urlInput: TextureUrlInput,
	optionsInput: TextureOptionsInput = {}
): UseTextureResult {
	const controller = createTextureLoadController({
		getUrls: typeof urlInput === 'function' ? urlInput : () => urlInput,
		getOptions: () => (typeof optionsInput === 'function' ? optionsInput() : optionsInput)
	});

	onMount(() => {
		void controller.reload();
	});
	onDestroy(controller.dispose);

	return {
		textures: controller.textures,
		loading: controller.loading,
		error: controller.error,
		errorReport: controller.errorReport,
		reload: controller.reload
	};
}
