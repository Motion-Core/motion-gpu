import { defineConfig, devices } from '@playwright/test';
import { webgpuLaunchArgs } from './e2e/webgpu';

const isCi = Boolean(process.env['CI']);
const linuxLaunchOptions = process.platform === 'linux' ? { channel: 'chromium' as const } : {};

export default defineConfig({
	testDir: './e2e/specs',
	reporter: isCi ? 'line' : 'list',
	maxFailures: isCi ? 1 : 0,
	timeout: 30_000,
	expect: {
		timeout: 5_000
	},
	fullyParallel: false,
	retries: isCi ? 2 : 0,
	...(isCi ? { workers: 1 } : {}),
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	webServer: [
		{
			command: 'pnpm run e2e:serve:svelte',
			url: 'http://127.0.0.1:4175',
			reuseExistingServer: !process.env['CI'],
			timeout: 120_000
		},
		{
			command: 'pnpm run e2e:serve:react',
			url: 'http://127.0.0.1:4176',
			reuseExistingServer: !process.env['CI'],
			timeout: 120_000
		},
		{
			command: 'pnpm run e2e:serve:vue',
			url: 'http://127.0.0.1:4177',
			reuseExistingServer: !process.env['CI'],
			timeout: 120_000
		}
	],
	projects: [
		{
			name: 'chromium-webgpu-svelte',
			use: {
				baseURL: 'http://127.0.0.1:4175',
				...devices['Desktop Chrome'],
				launchOptions: {
					...linuxLaunchOptions,
					args: webgpuLaunchArgs
				}
			}
		},
		{
			name: 'chromium-webgpu-react',
			use: {
				baseURL: 'http://127.0.0.1:4176',
				...devices['Desktop Chrome'],
				launchOptions: {
					...linuxLaunchOptions,
					args: webgpuLaunchArgs
				}
			}
		},
		{
			name: 'chromium-webgpu-vue',
			use: {
				baseURL: 'http://127.0.0.1:4177',
				...devices['Desktop Chrome'],
				launchOptions: {
					...linuxLaunchOptions,
					args: webgpuLaunchArgs
				}
			}
		}
	]
});
