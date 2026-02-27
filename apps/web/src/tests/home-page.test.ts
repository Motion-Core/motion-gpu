import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Page from '../routes/+page.svelte';

describe('home page', () => {
	it('renders single fragkit demo shell', () => {
		const { getByTestId, getByText } = render(Page);

		expect(getByTestId('fragkit-demo')).toBeTruthy();
		expect(getByText('FragKit')).toBeTruthy();
	});
});
