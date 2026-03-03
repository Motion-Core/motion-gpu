import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

export function toNumber(value: string | null): number {
	const parsed = Number(value ?? '');
	if (!Number.isFinite(parsed)) {
		throw new Error(`Expected numeric value, got: ${String(value)}`);
	}

	return parsed;
}

export async function getCanvasHash(page: Page): Promise<string> {
	const image = await page.locator('.canvas-shell canvas').screenshot();
	return createHash('sha1').update(image).digest('hex');
}
