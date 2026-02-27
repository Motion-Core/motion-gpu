import type {
	RenderPass,
	RenderPassContext,
	RenderPassFlags,
	RenderPassInputSlot,
	RenderPassOutputSlot
} from '../core/types';
import { BlitPass } from './BlitPass';

export interface CopyPassOptions extends RenderPassFlags {
	enabled?: boolean;
	needsSwap?: boolean;
	input?: RenderPassInputSlot;
	output?: RenderPassOutputSlot;
	filter?: GPUFilterMode;
}

/**
 * Texture copy pass with fullscreen-blit fallback.
 */
export class CopyPass implements RenderPass {
	enabled: boolean;
	needsSwap: boolean;
	input: RenderPassInputSlot;
	output: RenderPassOutputSlot;
	clear: boolean;
	clearColor: [number, number, number, number];
	preserve: boolean;
	private readonly fallbackBlit: BlitPass;

	constructor(options: CopyPassOptions = {}) {
		this.enabled = options.enabled ?? true;
		this.needsSwap = options.needsSwap ?? true;
		this.input = options.input ?? 'source';
		this.output = options.output ?? (this.needsSwap ? 'target' : 'source');
		this.clear = options.clear ?? false;
		this.clearColor = options.clearColor ?? [0, 0, 0, 1];
		this.preserve = options.preserve ?? true;
		this.fallbackBlit = new BlitPass({
			enabled: true,
			needsSwap: false,
			input: this.input,
			output: this.output,
			...(options.filter !== undefined ? { filter: options.filter } : {})
		});
	}

	setSize(width: number, height: number): void {
		this.fallbackBlit.setSize(width, height);
	}

	render(context: RenderPassContext): void {
		const source = context.input;
		const target = context.output;
		const canDirectCopy =
			context.clear === false &&
			context.preserve === true &&
			source.texture !== target.texture &&
			source.texture !== context.canvas.texture &&
			target.texture !== context.canvas.texture &&
			source.width === target.width &&
			source.height === target.height &&
			source.format === target.format;

		if (canDirectCopy) {
			context.commandEncoder.copyTextureToTexture(
				{ texture: source.texture },
				{ texture: target.texture },
				{ width: source.width, height: source.height, depthOrArrayLayers: 1 }
			);
			return;
		}

		this.fallbackBlit.render(context);
	}

	dispose(): void {
		this.fallbackBlit.dispose();
	}
}
