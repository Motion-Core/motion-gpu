import * as Babel from '@babel/standalone';
import typegpuBabelPlugin from 'unplugin-typegpu/babel';
import type { Plugin } from '@rollup/browser';

const TRANSFORM_INCLUDE = /\.(m?[jt]sx?)$/;
const EARLY_PRUNE_REGEX = [/\btypegpu\b/, /\btgpu\b/, /['"]use gpu['"]/];

const shouldTransform = (id: string, code: string) => {
	if (!TRANSFORM_INCLUDE.test(id)) return false;
	return EARLY_PRUNE_REGEX.some((pattern) => pattern.test(code));
};

const typegpuTransformPlugin = (): Plugin => ({
	name: 'typegpu-standalone-transform',
	transform(code, id) {
		if (!shouldTransform(id, code)) return null;

		const result = Babel.transform(code, {
			filename: id,
			presets: [['typescript', { allowDeclareFields: true }]],
			plugins: [typegpuBabelPlugin]
		}).code;

		if (!result || result === code) return null;
		return { code: result, map: null };
	}
});

export default typegpuTransformPlugin;
