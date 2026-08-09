// Shared SVG data for application icons.
type IconElementBase = {
	fill?: 'none' | 'currentColor';
	fillRule?: 'evenodd' | 'nonzero';
	stroke?: boolean;
};

export type AppIconElement =
	| (IconElementBase & { type: 'path'; d: string })
	| (IconElementBase & { type: 'polyline'; points: string })
	| (IconElementBase & { type: 'line'; x1: string; y1: string; x2: string; y2: string })
	| (IconElementBase & {
			type: 'rect';
			x: string;
			y: string;
			width: string;
			height: string;
			rx?: string;
			ry?: string;
	  })
	| (IconElementBase & { type: 'circle'; cx: string; cy: string; r: string })
	| (IconElementBase & {
			type: 'ellipse';
			cx: string;
			cy: string;
			rx: string;
			ry: string;
	  });

export type AppIconData = {
	viewBox: string;
	elements: readonly AppIconElement[];
	transform?: string;
};

const outlineIcon = (elements: readonly AppIconElement[], transform?: string): AppIconData => ({
	viewBox: '0 0 18 18',
	elements,
	transform
});

const socialIcon = (d: string, fillRule?: 'evenodd'): AppIconData => ({
	viewBox: '0 0 32 32',
	elements: [{ type: 'path', d, fill: 'currentColor', fillRule }]
});

export const arrowLeftIcon = outlineIcon([
	{ type: 'line', x1: '2.75', y1: '9', x2: '15.25', y2: '9', stroke: true },
	{ type: 'polyline', points: '7 13.25 2.75 9 7 4.75', stroke: true }
]);

export const arrowRightIcon = outlineIcon([
	{ type: 'line', x1: '15.25', y1: '9', x2: '2.75', y2: '9', stroke: true },
	{ type: 'polyline', points: '11 4.75 15.25 9 11 13.25', stroke: true }
]);

export const assemblyIcon = outlineIcon([
	{ type: 'polyline', points: '14.983 5.53 9 9 3.017 5.53', stroke: true },
	{ type: 'line', x1: '9', y1: '15.938', x2: '9', y2: '9', stroke: true },
	{
		type: 'path',
		d: 'M7.997,2.332L3.747,4.797c-.617,.358-.997,1.017-.997,1.73v4.946c0,.713,.38,1.372,.997,1.73l4.25,2.465c.621,.36,1.386,.36,2.007,0l4.25-2.465c.617-.358,.997-1.017,.997-1.73V6.527c0-.713-.38-1.372-.997-1.73l-4.25-2.465c-.621-.36-1.386-.36-2.007,0Z',
		stroke: true
	}
]);

export const bookIcon = outlineIcon([
	{
		type: 'path',
		d: 'M9,15.051c.17,0,.339-.045,.494-.134,.643-.371,1.732-.847,3.141-.845,.899,.001,1.667,.197,2.27,.435,.648,.255,1.344-.24,1.344-.937V4.487c0-.354-.181-.68-.486-.86-.637-.376-1.726-.863-3.14-.863-1.89,0-3.198,.872-3.624,1.182',
		stroke: true
	},
	{
		type: 'path',
		d: 'M9,15.051c-.17,0-.339-.045-.494-.134-.643-.371-1.732-.847-3.141-.845-.899,.001-1.667,.197-2.27,.435-.648,.255-1.344-.237-1.344-.933,0-2.593,0-7.472,0-9.09,0-.354,.181-.676,.486-.856,.637-.376,1.726-.863,3.14-.863,1.89,0,3.198,.872,3.624,1.182h0s0,11.104,0,11.104Z',
		stroke: true
	}
]);

export const checkIcon = outlineIcon([
	{ type: 'polyline', points: '2.75 9.25 6.75 14.25 15.25 3.75', stroke: true }
]);

export const chevronDownIcon = outlineIcon([
	{ type: 'polyline', points: '15.25 6.5 9 12.75 2.75 6.5', stroke: true }
]);

export const chevronRightIcon = outlineIcon([
	{ type: 'polyline', points: '6.5 2.75 12.75 9 6.5 15.25', stroke: true }
]);

export const circleQuestionIcon = outlineIcon([
	{ type: 'circle', cx: '9', cy: '9', r: '7.25', stroke: true },
	{
		type: 'path',
		d: 'M6.925,6.619c.388-1.057,1.294-1.492,2.18-1.492,.895,0,1.818,.638,1.818,1.808,0,1.784-1.816,1.468-2.096,3.065',
		stroke: true
	},
	{
		type: 'path',
		d: 'M8.791,13.567c-.552,0-1-.449-1-1s.448-1,1-1,1,.449,1,1-.448,1-1,1Z',
		fill: 'currentColor'
	}
]);

export const closeIcon = outlineIcon([
	{ type: 'line', x1: '14', y1: '4', x2: '4', y2: '14', stroke: true },
	{ type: 'line', x1: '4', y1: '4', x2: '14', y2: '14', stroke: true }
]);

export const copyIcon = outlineIcon([
	{
		type: 'path',
		d: 'M13.75 5.25H7.25C6.145 5.25 5.25 6.145 5.25 7.25V13.75C5.25 14.855 6.145 15.75 7.25 15.75H13.75C14.855 15.75 15.75 14.855 15.75 13.75V7.25C15.75 6.145 14.855 5.25 13.75 5.25Z',
		stroke: true
	},
	{
		type: 'path',
		d: 'M12.4012 2.74998C12.0022 2.06148 11.2151 1.64837 10.38 1.77287L3.45602 2.80199C2.36402 2.96389 1.61003 3.98099 1.77203 5.07399L2.75002 11.6548',
		stroke: true
	}
]);

export const codeIcon = outlineIcon([
	{ type: 'polyline', points: '6.5 13.75 1.75 9 6.5 4.25', stroke: true },
	{ type: 'polyline', points: '11.5 13.75 16.25 9 11.5 4.25', stroke: true }
]);

export const databaseIcon = outlineIcon([
	{ type: 'ellipse', cx: '9', cy: '4.25', rx: '6.25', ry: '2.25', stroke: true },
	{
		type: 'path',
		d: 'M2.75,4.25V13.75c0,1.243,2.798,2.25,6.25,2.25s6.25-1.007,6.25-2.25V4.25',
		stroke: true
	},
	{
		type: 'path',
		d: 'M2.75,9c0,1.243,2.798,2.25,6.25,2.25s6.25-1.007,6.25-2.25',
		stroke: true
	}
]);

export const enterIcon = outlineIcon([
	{
		type: 'path',
		d: 'M2.75,8.25H13.25c1.105,0,2,.895,2,2v4',
		stroke: true
	},
	{ type: 'polyline', points: '7 12.5 2.75 8.25 7 4', stroke: true }
]);

export const externalLinkIcon = outlineIcon([
	{
		type: 'path',
		d: 'M4.25,9.25V3.75c0-1.105,.895-2,2-2h6c1.105,0,2,.895,2,2V13.25c0,1.105-.895,2-2,2H7.25',
		stroke: true
	},
	{ type: 'polyline', points: '7.24 6.75 11.25 6.75 11.25 10.76', stroke: true },
	{ type: 'line', x1: '11.25', y1: '6.75', x2: '1.75', y2: '16.25', stroke: true }
]);

export const githubIcon = socialIcon(
	'M16,2.345c7.735,0,14,6.265,14,14-.002,6.015-3.839,11.359-9.537,13.282-.7,.14-.963-.298-.963-.665,0-.473,.018-1.978,.018-3.85,0-1.312-.437-2.152-.945-2.59,3.115-.35,6.388-1.54,6.388-6.912,0-1.54-.543-2.783-1.435-3.762,.14-.35,.63-1.785-.14-3.71,0,0-1.173-.385-3.85,1.435-1.12-.315-2.31-.472-3.5-.472s-2.38,.157-3.5,.472c-2.677-1.802-3.85-1.435-3.85-1.435-.77,1.925-.28,3.36-.14,3.71-.892,.98-1.435,2.24-1.435,3.762,0,5.355,3.255,6.563,6.37,6.913-.403,.35-.77,.963-.893,1.872-.805,.368-2.818,.963-4.077-1.155-.263-.42-1.05-1.452-2.152-1.435-1.173,.018-.472,.665,.017,.927,.595,.332,1.277,1.575,1.435,1.978,.28,.787,1.19,2.293,4.707,1.645,0,1.173,.018,2.275,.018,2.607,0,.368-.263,.787-.963,.665-5.719-1.904-9.576-7.255-9.573-13.283,0-7.735,6.265-14,14-14Z'
);

export const grid2x2Icon = outlineIcon([
	{ type: 'line', x1: '15.75', y1: '9', x2: '2.25', y2: '9', stroke: true },
	{ type: 'line', x1: '9', y1: '15.75', x2: '9', y2: '2.25', stroke: true }
]);

export const layersIcon = outlineIcon([
	{
		type: 'path',
		d: 'M2.58,6.149L8.385,1.949c.367-.266,.864-.266,1.231,0l5.805,4.2c.579,.419,.579,1.282,0,1.701l-5.805,4.2c-.367,.266-.864,.266-1.231,0L2.58,7.851c-.579-.419-.579-1.282,0-1.701Z',
		stroke: true
	},
	{
		type: 'path',
		d: 'M15.746,10.533c.217,.439,.109,1.003-.326,1.317l-5.805,4.2c-.184,.133-.4,.199-.615,.199-.216,0-.432-.066-.615-.199L2.58,11.851c-.434-.314-.543-.878-.326-1.317',
		stroke: true
	}
]);

export const menuIcon = outlineIcon([
	{ type: 'line', x1: '2.25', y1: '9', x2: '15.75', y2: '9', stroke: true },
	{ type: 'line', x1: '2.25', y1: '4.75', x2: '15.75', y2: '4.75', stroke: true },
	{ type: 'line', x1: '2.25', y1: '13.25', x2: '15.75', y2: '13.25', stroke: true }
]);

const darkLightElements: readonly AppIconElement[] = [
	{ type: 'path', d: 'M9,6v6c1.657,0,3-1.343,3-3s-1.343-3-3-3Z', fill: 'currentColor' },
	{
		type: 'path',
		d: 'M9,12c-1.657,0-3-1.343-3-3s1.343-3,3-3V1.75C4.996,1.75,1.75,4.996,1.75,9s3.246,7.25,7.25,7.25v-4.25Z',
		fill: 'currentColor'
	},
	{ type: 'circle', cx: '9', cy: '9', r: '7.25', stroke: true }
];

export const moonIcon = outlineIcon(darkLightElements, 'matrix(-1 0 0 1 18 0)');

export const moreHorizontalIcon = outlineIcon([
	{ type: 'circle', cx: '9', cy: '9', r: '.5', fill: 'currentColor', stroke: true },
	{ type: 'circle', cx: '3.25', cy: '9', r: '.5', fill: 'currentColor', stroke: true },
	{ type: 'circle', cx: '14.75', cy: '9', r: '.5', fill: 'currentColor', stroke: true }
]);

export const plusIcon = outlineIcon([
	{ type: 'line', x1: '9', y1: '3.25', x2: '9', y2: '14.75', stroke: true },
	{ type: 'line', x1: '3.25', y1: '9', x2: '14.75', y2: '9', stroke: true }
]);

export const searchIcon = outlineIcon([
	{ type: 'path', d: 'M15.75 15.75L11.6386 11.6386', stroke: true },
	{
		type: 'path',
		d: 'M7.75 13.25C10.7875 13.25 13.25 10.7875 13.25 7.75C13.25 4.7125 10.7875 2.25 7.75 2.25C4.7125 2.25 2.25 4.7125 2.25 7.75C2.25 10.7875 4.7125 13.25 7.75 13.25Z',
		stroke: true
	}
]);

export const space3dIcon = outlineIcon([
	{ type: 'polyline', points: '3.017 12.47 9 9 14.983 12.47', stroke: true },
	{ type: 'line', x1: '9', y1: '2.062', x2: '9', y2: '9', stroke: true },
	{
		type: 'path',
		d: 'M15.25,11.473V6.527c0-.713-.38-1.372-.997-1.73l-4.25-2.465c-.621-.36-1.386-.36-2.007,0L3.747,4.797c-.617,.358-.997,1.017-.997,1.73v4.946c0,.713,.38,1.372,.997,1.73l4.25,2.465c.621,.36,1.386,.36,2.007,0l4.25-2.465c.617-.358,.997-1.017,.997-1.73Z',
		stroke: true
	}
]);

export const sunIcon = outlineIcon(darkLightElements);

export const tableOfContentsIcon = outlineIcon([
	{ type: 'line', x1: '15.25', y1: '9', x2: '2.75', y2: '9', stroke: true },
	{
		type: 'rect',
		x: '2.75',
		y: '2.75',
		width: '12.5',
		height: '12.5',
		rx: '2',
		ry: '2',
		stroke: true
	}
]);

export const touchClickIcon = outlineIcon([
	{
		type: 'path',
		d: 'm17.25,15.225c0-2.059-.236-3.639-1-4.223-.875-.669-3.152-.838-5.295-.232l-1.33-2.827c-.293-.626-1.037-.896-1.663-.603h0c-.625.292-.896,1.036-.604,1.661l2.561,5.456-2.724-.501c-.587-.108-1.167,.224-1.371,.785h0c-.232,.637,.098,1.34,.736,1.569l2.616,.941',
		stroke: true
	},
	{
		type: 'path',
		d: 'm5.2469,11.2351c-.6221-.7392-.9969-1.6934-.9969-2.7351,0-2.3472,1.9028-4.25,4.25-4.25,1.9793,0,3.6426,1.353,4.1154,3.1846',
		stroke: true
	},
	{
		type: 'path',
		d: 'm3.1416,13.3837c-1.1751-1.2885-1.8916-3.0024-1.8916-4.8837C1.25,4.4959,4.4959,1.25,8.5,1.25c3.6994,0,6.7517,2.7708,7.1947,6.3503',
		stroke: true
	}
]);

export const transform3dIcon = outlineIcon([
	{
		type: 'path',
		d: 'm4.5856,4.3607l8.5-1.4167c.6095-.1016,1.1644.3685,1.1644.9864v10.1391c0,.6179-.5549,1.088-1.1644.9864l-8.5-1.4167c-.4822-.0804-.8356-.4976-.8356-.9864v-7.3057c0-.4888.3534-.906.8356-.9864Z',
		stroke: true
	},
	{ type: 'line', x1: '8.25', y1: '16.25', x2: '8.25', y2: '1.75', stroke: true },
	{ type: 'line', x1: '2.25', y1: '9', x2: '15.75', y2: '9', stroke: true }
]);

export const triangleWarningIcon = outlineIcon([
	{
		type: 'path',
		d: 'M7.63796 3.48996L2.21295 12.89C1.60795 13.9399 2.36395 15.25 3.57495 15.25H14.425C15.636 15.25 16.392 13.9399 15.787 12.89L10.362 3.48996C9.75696 2.44996 8.24296 2.44996 7.63796 3.48996Z',
		stroke: true
	},
	{ type: 'path', d: 'M9 6.75V9.75', stroke: true },
	{
		type: 'path',
		d: 'M9 13.5C8.448 13.5 8 13.05 8 12.5C8 11.95 8.448 11.5 9 11.5C9.552 11.5 10 11.9501 10 12.5C10 13.0499 9.552 13.5 9 13.5Z',
		fill: 'currentColor'
	}
]);

export const workflowIcon = outlineIcon([
	{
		type: 'path',
		d: 'm8.25,4.75c1.1046,0,2,.8954,2,2v4.5c0,1.1046.8954,2,2,2h3.75',
		stroke: true
	},
	{ type: 'circle', cx: '3.75', cy: '4.75', r: '2', stroke: true },
	{ type: 'polyline', points: '13.5 10.5 16.25 13.25 13.5 16', stroke: true }
]);
