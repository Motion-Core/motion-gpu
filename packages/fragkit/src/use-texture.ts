import { onDestroy } from 'svelte';
import type { CurrentReadable } from './current-writable';
import { currentWritable } from './current-writable';
import {
	loadTexturesFromUrls,
	type LoadedTexture,
	type TextureLoadOptions
} from './core/texture-loader';

export interface UseTextureResult {
	textures: CurrentReadable<LoadedTexture[] | null>;
	loading: CurrentReadable<boolean>;
	error: CurrentReadable<Error | null>;
	reload: () => Promise<void>;
}

export type TextureUrlInput = string[] | (() => string[]);

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error('Unknown texture loading error');
}

function disposeTextures(list: LoadedTexture[] | null): void {
	for (const texture of list ?? []) {
		texture.dispose();
	}
}

export function useTexture(
	urlInput: TextureUrlInput,
	options: TextureLoadOptions = {}
): UseTextureResult {
	const textures = currentWritable<LoadedTexture[] | null>(null);
	const loading = currentWritable(true);
	const error = currentWritable<Error | null>(null);
	let disposed = false;
	let requestVersion = 0;
	const getUrls = typeof urlInput === 'function' ? urlInput : () => urlInput;

	const load = async (): Promise<void> => {
		const version = ++requestVersion;
		loading.set(true);
		error.set(null);

		const previous = textures.current;
		try {
			const loaded = await loadTexturesFromUrls(getUrls(), options);
			if (disposed || version !== requestVersion) {
				disposeTextures(loaded);
				return;
			}

			textures.set(loaded);
			disposeTextures(previous);
		} catch (nextError) {
			if (disposed || version !== requestVersion) {
				return;
			}

			disposeTextures(previous);
			textures.set(null);
			error.set(toError(nextError));
		} finally {
			if (!disposed && version === requestVersion) {
				loading.set(false);
			}
		}
	};

	void load();

	onDestroy(() => {
		disposed = true;
		requestVersion += 1;
		disposeTextures(textures.current);
	});

	return {
		textures,
		loading,
		error,
		reload: load
	};
}
