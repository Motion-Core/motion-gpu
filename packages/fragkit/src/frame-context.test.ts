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
			invalidate: registry.invalidate,
			advance: registry.advance,
			renderMode: registry.getRenderMode(),
			autoRender: registry.getAutoRender(),
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
			invalidate: registry.invalidate,
			advance: registry.advance,
			renderMode: registry.getRenderMode(),
			autoRender: registry.getAutoRender(),
			canvas: document.createElement('canvas')
		});

		expect(callback).not.toHaveBeenCalled();
	});

	it('supports on-demand invalidation flow', () => {
		const registry = createFrameRegistry({ renderMode: 'on-demand' });

		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);

		registry.invalidate();
		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('supports manual advance flow', () => {
		const registry = createFrameRegistry({ renderMode: 'manual' });

		expect(registry.shouldRender()).toBe(false);
		registry.advance();
		expect(registry.shouldRender()).toBe(true);
		registry.endFrame();
		expect(registry.shouldRender()).toBe(false);
	});

	it('can disable auto-render', () => {
		const registry = createFrameRegistry({ renderMode: 'always', autoRender: false });
		expect(registry.shouldRender()).toBe(false);
	});
});
