export const RESONANCE_MEDIUM_SIZE = 1024;

export function paintResonanceMedium(context: CanvasRenderingContext2D): void {
	const size = RESONANCE_MEDIUM_SIZE;
	context.fillStyle = '#5b5b5b';
	context.fillRect(0, 0, size, size);

	const fields: Array<[number, number, number, string, string]> = [
		[0.25, 0.3, 0.42, 'rgba(255,255,255,0.36)', 'rgba(0,0,0,0)'],
		[0.74, 0.68, 0.46, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)'],
		[0.55, 0.18, 0.32, 'rgba(255,255,255,0.2)', 'rgba(0,0,0,0)']
	];

	for (const [x, y, radius, inner, outer] of fields) {
		const gradient = context.createRadialGradient(
			x * size,
			y * size,
			0,
			x * size,
			y * size,
			radius * size
		);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(0.55, outer);
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
	}

	const diagonal = context.createLinearGradient(0, size, size, 0);
	diagonal.addColorStop(0, 'rgba(0,0,0,0.16)');
	diagonal.addColorStop(0.48, 'rgba(255,255,255,0.08)');
	diagonal.addColorStop(1, 'rgba(0,0,0,0.12)');
	context.fillStyle = diagonal;
	context.fillRect(0, 0, size, size);
}
