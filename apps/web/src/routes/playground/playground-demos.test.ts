import { describe, expect, it } from 'vitest';
import { getPlaygroundDemoVariant, type PlaygroundFramework } from './playground-demos';

describe('data-mosh playground demo', () => {
	it.each<PlaygroundFramework>(['svelte', 'react', 'vue'])(
		'requests video with CORS before appending its sources in the %s runtime',
		(framework) => {
			const source = getPlaygroundDemoVariant('data-mosh', framework)?.runtimeSource;
			expect(source).toBeDefined();

			const crossOriginAssignment = source?.indexOf("video.crossOrigin = 'anonymous'") ?? -1;
			const sourceAssignment = source?.indexOf('video.append(source)') ?? -1;
			expect(crossOriginAssignment).toBeGreaterThanOrEqual(0);
			expect(sourceAssignment).toBeGreaterThan(crossOriginAssignment);
		}
	);
});
