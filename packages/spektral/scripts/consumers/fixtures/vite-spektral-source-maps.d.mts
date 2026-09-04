export interface PublishedSpektralSourceMapPlugin {
	name: string;
	enforce: 'pre';
}

export declare function preserveSpektralSourceMaps(): PublishedSpektralSourceMapPlugin;
