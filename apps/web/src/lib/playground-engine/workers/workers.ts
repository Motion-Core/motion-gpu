import type { PlaygroundFile } from '../types';

export interface BundleOptions {
	svelte_version: string;
	runes?: boolean;
}

export type BundleMessageData =
	| {
			uid: number;
			type: 'init';
			svelte_version: string;
	  }
	| {
			uid: number;
			type: 'bundle';
			files: PlaygroundFile[];
			options: BundleOptions;
	  };
