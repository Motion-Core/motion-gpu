import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
	output: 'export',
	productionBrowserSourceMaps: true,
	webpack(webpackConfig) {
		webpackConfig.module.rules.push({
			enforce: 'pre',
			include: /node_modules[\\/]spektral[\\/]dist[\\/]/,
			test: /\.js$/,
			use: path.join(fixtureDirectory, 'spektral-source-map-loader.cjs')
		});
		return webpackConfig;
	}
};

export default config;
