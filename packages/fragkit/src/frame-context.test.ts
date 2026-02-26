import { describe, expect, it, vi } from 'vitest';
import { createFrameRegistry } from './frame-context';

describe('frame registry', () => {
	it('runs registered callbacks', () => {
		const registry = createFrameRegistry();
		const callback = vi.fn();
		registry.register(callback);

		registry.run({
			time: 1,
			delta: 0.016,
			setUniform: vi.fn(),
			canvas: document.createElement('canvas')
		});

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({
				time: 1,
				delta: 0.016
			})
		);
	});

	it('stops calling unsubscribed callbacks', () => {
		const registry = createFrameRegistry();
		const callback = vi.fn();
		const unsubscribe = registry.register(callback);
		unsubscribe();

		registry.run({
			time: 1,
			delta: 0.016,
			setUniform: vi.fn(),
			canvas: document.createElement('canvas')
		});

		expect(callback).not.toHaveBeenCalled();
	});
});
