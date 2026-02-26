export interface TextureLoadOptions {
	colorSpace?: 'srgb' | 'linear';
	requestInit?: RequestInit;
}

export interface LoadedTexture {
	url: string;
	source: ImageBitmap;
	width: number;
	height: number;
	dispose: () => void;
}

const blobCache = new Map<string, Promise<Blob>>();

export function clearTextureBlobCache(): void {
	blobCache.clear();
}

async function fetchTextureBlob(url: string, requestInit?: RequestInit): Promise<Blob> {
	const key = `${requestInit?.cache ?? 'default'}:${url}`;
	const cached = blobCache.get(key);
	if (cached) {
		return cached;
	}

	const request = fetch(url, requestInit)
		.then(async (response) => {
			if (!response.ok) {
				throw new Error(`Texture request failed (${response.status}) for ${url}`);
			}
			return response.blob();
		})
		.catch((error) => {
			blobCache.delete(key);
			throw error;
		});

	blobCache.set(key, request);
	return request;
}

export async function loadTextureFromUrl(
	url: string,
	options: TextureLoadOptions = {}
): Promise<LoadedTexture> {
	if (typeof createImageBitmap !== 'function') {
		throw new Error('createImageBitmap is not available in this runtime');
	}

	const blob = await fetchTextureBlob(url, options.requestInit);
	const bitmap =
		options.colorSpace === 'linear'
			? await createImageBitmap(blob, { colorSpaceConversion: 'none' })
			: await createImageBitmap(blob);

	return {
		url,
		source: bitmap,
		width: bitmap.width,
		height: bitmap.height,
		dispose: () => {
			bitmap.close();
		}
	};
}

export function loadTexturesFromUrls(
	urls: string[],
	options: TextureLoadOptions = {}
): Promise<LoadedTexture[]> {
	return Promise.all(urls.map((url) => loadTextureFromUrl(url, options)));
}
