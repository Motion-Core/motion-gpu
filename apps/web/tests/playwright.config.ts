import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);

export default defineConfig({
	testDir: './e2e',
	timeout: 120_000,
	expect: {
		timeout: 90_000
	},
	retries: isCi ? 2 : 0,
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4178',
		...devices['Desktop Chrome'],
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		launchOptions: {
			args: [
				'--enable-unsafe-webgpu',
				'--use-angle=swiftshader',
				'--enable-features=Vulkan',
				'--disable-vulkan-surface'
			]
		}
	},
	webServer: {
		command: 'pnpm exec vite dev --host 127.0.0.1 --port 4178 --strictPort',
		url: 'http://127.0.0.1:4178',
		reuseExistingServer: !isCi,
		timeout: 120_000
	}
});
