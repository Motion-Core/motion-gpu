import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env['CI']);

export default defineConfig({
	testDir: './e2e/specs',
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	fullyParallel: false,
	retries: isCi ? 2 : 0,
	...(isCi ? { workers: 1 } : {}),
	use: {
		baseURL: 'http://127.0.0.1:4175',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	webServer: {
		command: 'bun run e2e:serve',
		url: 'http://127.0.0.1:4175',
		reuseExistingServer: !process.env['CI'],
		timeout: 120_000
	},
	projects: [
		{
			name: 'chromium-webgpu',
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						'--enable-unsafe-webgpu',
						'--use-angle=swiftshader',
						'--enable-features=Vulkan',
						'--disable-vulkan-surface'
					]
				}
			}
		}
	]
});
