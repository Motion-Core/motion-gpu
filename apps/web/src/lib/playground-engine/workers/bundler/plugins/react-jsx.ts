import * as Babel from '@babel/standalone';
import type { Plugin } from '@rollup/browser';

const REACT_TSX_REGEX = /\.(jsx|tsx)$/;

const reactJsxPlugin = (): Plugin => ({
	name: 'react-jsx-transform',
	transform(code, id) {
		if (!REACT_TSX_REGEX.test(id)) return null;

		const result = Babel.transform(code, {
			filename: id,
			sourceType: 'module',
			presets: [
				[
					'react',
					{
						runtime: 'automatic',
						development: false
					}
				],
				[
					'typescript',
					{
						allExtensions: true,
						isTSX: id.endsWith('.tsx'),
						allowDeclareFields: true
					}
				]
			]
		}).code;

		if (!result || result === code) return null;
		return { code: result, map: null };
	}
});

export default reactJsxPlugin;
