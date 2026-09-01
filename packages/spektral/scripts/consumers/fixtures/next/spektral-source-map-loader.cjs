module.exports = function preserveSpektralSourceMap(source, inputSourceMap) {
	this.cacheable?.();
	const done = this.async();
	import('node:fs/promises')
		.then(({ readFile }) => readFile(`${this.resourcePath}.map`, 'utf8'))
		.then((sourceMap) => done(null, source, JSON.parse(sourceMap)))
		.catch((error) => {
			if (error?.code === 'ENOENT') {
				done(null, source, inputSourceMap);
				return;
			}
			done(error);
		});
};
