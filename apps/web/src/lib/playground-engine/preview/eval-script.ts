import type { BundleResult } from '../types';

export const buildEvalScript = (bundle: BundleResult, injectedJS = '') => {
	if (!bundle.client?.code) {
		return '';
	}

	return `
		${injectedJS}

		{
			const styles = document.querySelectorAll('style[id^=svelte-]');
			let i = styles.length;
			while (i--) styles[i].parentNode?.removeChild(styles[i]);

			if (window.__unmount_previous) {
				try {
					window.__unmount_previous();
				} catch (err) {
					console.error(err);
				}
			}

			document.body.innerHTML = '';
		}

		const __repl_exports = ${bundle.client.code};
		{
			const { mount, unmount, App } = __repl_exports;
			let component;
			try {
				component = mount(App, { target: document.body });
			} finally {
				window.__unmount_previous = () => {
					if (component) {
						unmount(component);
					}
				};
			}
		}
	`;
};
