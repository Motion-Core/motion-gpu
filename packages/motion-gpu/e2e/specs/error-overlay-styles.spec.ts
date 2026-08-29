import { expect, test, type Page } from '@playwright/test';

interface OverlayStyleSignature {
	overlay: {
		position: string;
		display: string;
		zIndex: string;
		fontFamily: string;
		fontSize: string;
		lineHeight: string;
		textAlign: string;
	};
	shell: {
		borderRadius: string;
		overflow: string;
	};
	dialog: {
		display: string;
		backgroundColor: string;
		borderRadius: string;
	};
	header: {
		display: string;
		columns: string;
	};
	badges: {
		display: string;
		justifyContent: string;
	};
	title: {
		margin: string;
		color: string;
		fontFamily: string;
		fontSize: string;
		lineHeight: string;
		textAlign: string;
	};
	snippet: {
		display: string;
		backgroundColor: string;
	};
	row: {
		display: string;
		columns: string;
	};
	details: {
		margin: string;
		backgroundColor: string;
		fontFamily: string;
		fontSize: string;
		lineHeight: string;
	};
}

async function readStyleSignature(page: Page): Promise<OverlayStyleSignature> {
	return page.evaluate(() => {
		const read = (selector: string): CSSStyleDeclaration => {
			const element = document.querySelector(selector);
			if (!(element instanceof HTMLElement)) {
				throw new Error(`Expected ${selector} to resolve to an HTMLElement`);
			}
			return getComputedStyle(element);
		};

		const overlay = read('.motiongpu-error-overlay');
		const shell = read('.motiongpu-error-dialog-shell');
		const dialog = read('.motiongpu-error-dialog');
		const header = read('.motiongpu-error-header-top');
		const badges = read('.motiongpu-error-badges');
		const title = read('.motiongpu-error-title');
		const snippet = read('.motiongpu-error-source-snippet');
		const row = read('.motiongpu-error-source-row');
		const details = read('.motiongpu-error-details pre');

		return {
			overlay: {
				position: overlay.position,
				display: overlay.display,
				zIndex: overlay.zIndex,
				fontFamily: overlay.fontFamily,
				fontSize: overlay.fontSize,
				lineHeight: overlay.lineHeight,
				textAlign: overlay.textAlign
			},
			shell: {
				borderRadius: shell.borderRadius,
				overflow: shell.overflow
			},
			dialog: {
				display: dialog.display,
				backgroundColor: dialog.backgroundColor,
				borderRadius: dialog.borderRadius
			},
			header: {
				display: header.display,
				columns: header.gridTemplateColumns
			},
			badges: {
				display: badges.display,
				justifyContent: badges.justifyContent
			},
			title: {
				margin: title.margin,
				color: title.color,
				fontFamily: title.fontFamily,
				fontSize: title.fontSize,
				lineHeight: title.lineHeight,
				textAlign: title.textAlign
			},
			snippet: {
				display: snippet.display,
				backgroundColor: snippet.backgroundColor
			},
			row: {
				display: row.display,
				columns: row.gridTemplateColumns
			},
			details: {
				margin: details.margin,
				backgroundColor: details.backgroundColor,
				fontFamily: details.fontFamily,
				fontSize: details.fontSize,
				lineHeight: details.lineHeight
			}
		};
	});
}

test.describe('shared error overlay styles', () => {
	test('preserves cascade and responsive layout', async ({ page }) => {
		await page.setViewportSize({ width: 1000, height: 900 });
		await page.goto('/?scenario=error-overlay-style');
		await expect(page.getByTestId('motiongpu-error')).toBeVisible();
		await page.evaluate(() => {
			document.documentElement.dataset['motiongpuCascadeProof'] = '';
		});

		const desktop = await readStyleSignature(page);

		expect(desktop.overlay).toEqual({
			position: 'fixed',
			display: 'grid',
			zIndex: '2147483647',
			fontFamily: '"APK Galeria", ui-sans-serif, system-ui, sans-serif',
			fontSize: '14px',
			lineHeight: '21px',
			textAlign: 'start'
		});
		expect(desktop.shell).toEqual({ borderRadius: '48px', overflow: 'hidden' });
		expect(desktop.dialog.display).toBe('block');
		expect(desktop.dialog.backgroundColor).not.toBe('rgb(0, 255, 0)');
		expect(desktop.dialog.borderRadius).toBe('42px');
		expect(desktop.header.display).toBe('grid');
		expect(desktop.header.columns).not.toBe('none');
		expect(desktop.badges).toEqual({ display: 'flex', justifyContent: 'flex-end' });
		expect(desktop.title).toEqual({
			margin: '0px',
			color: desktop.title.color,
			fontFamily: '"APK Galeria", ui-sans-serif, system-ui, sans-serif',
			fontSize: '20px',
			lineHeight: '24px',
			textAlign: 'start'
		});
		expect(desktop.title.color).not.toBe('rgb(255, 0, 255)');
		expect(desktop.snippet.display).toBe('grid');
		expect(desktop.snippet.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
		expect(desktop.snippet.backgroundColor).not.toBe('rgb(0, 255, 0)');
		expect(desktop.row.display).toBe('grid');
		expect(desktop.row.columns).not.toBe('none');
		expect(desktop.details.margin).toBe('0px');
		expect(desktop.details.backgroundColor).not.toBe('rgb(0, 255, 0)');
		expect(desktop.details.fontFamily).toContain('Berkeley Mono');
		expect(desktop.details.fontSize).toBe('13px');
		expect(desktop.details.lineHeight).toBe('19.5px');

		await page.setViewportSize({ width: 480, height: 800 });
		const mobile = await readStyleSignature(page);

		expect(mobile.header.columns).toBe('416px');
		expect(mobile.badges.justifyContent).toBe('flex-start');
		expect(mobile.row.columns).toMatch(/^32px /);
		expect(mobile.dialog.backgroundColor).toBe(desktop.dialog.backgroundColor);
		expect(mobile.snippet.backgroundColor).toBe(desktop.snippet.backgroundColor);
		expect(mobile.details.backgroundColor).toBe(desktop.details.backgroundColor);
	});
});
