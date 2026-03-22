import { useMemo, useState } from 'react';
import { useTexture } from '../../../src/lib/react';
import { useCurrent } from '../use-current';

function createSuccessTextureUrl(): string {
	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 2;
	const context = canvas.getContext('2d');
	if (!context) {
		return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
	}

	context.fillStyle = '#20a4f3';
	context.fillRect(0, 0, 2, 2);
	context.fillStyle = '#f39c12';
	context.fillRect(1, 1, 1, 1);
	return canvas.toDataURL('image/png');
}

const SUCCESS_URL = createSuccessTextureUrl();
const MISSING_URL = '/missing-texture-e2e.png';

export function TextureScenario() {
	const [urls, setUrls] = useState<string[]>(() => [SUCCESS_URL]);
	const result = useTexture(() => urls);

	const loading = useCurrent(result.loading);
	const error = useCurrent(result.error);
	const textures = useCurrent(result.textures);
	const textureUrlMode = useMemo(() => (urls[0] === SUCCESS_URL ? 'success' : 'missing'), [urls]);

	return (
		<main className="harness-main">
			<section className="harness-controls">
				<div data-testid="texture-loading">{loading ? 'yes' : 'no'}</div>
				<div data-testid="texture-error">{error?.message ?? 'none'}</div>
				<div data-testid="texture-count">{textures?.length ?? 0}</div>
				<div data-testid="texture-url-mode">{textureUrlMode}</div>

				<button
					className="harness-button"
					data-testid="set-success-url"
					onClick={() => setUrls([SUCCESS_URL])}
				>
					set success url
				</button>
				<button
					className="harness-button"
					data-testid="set-missing-url"
					onClick={() => setUrls([MISSING_URL])}
				>
					set missing url
				</button>
				<button
					className="harness-button"
					data-testid="reload-textures"
					onClick={() => {
						void result.reload();
					}}
				>
					reload
				</button>
			</section>
		</main>
	);
}
