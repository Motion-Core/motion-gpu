import type { RequestHandler } from './$types';
import { siteConfig } from '$lib';
import { createOgImage } from '$lib/seo/og-image';

export const prerender = true;

export const GET: RequestHandler = () =>
	createOgImage({
		title: siteConfig.name,
		description: siteConfig.description
	});
