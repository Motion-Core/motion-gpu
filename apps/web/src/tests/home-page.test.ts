import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Page from '../routes/+page.svelte';

describe('home page', () => {
	it('renders single motiongpu demo shell', () => {
		const { getByTestId, getByText } = render(Page);

		expect(getByTestId('motiongpu-demo')).toBeTruthy();
		expect(getByText('MotionGPU')).toBeTruthy();
	});
});
