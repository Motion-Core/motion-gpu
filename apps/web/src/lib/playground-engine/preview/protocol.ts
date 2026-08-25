export const PLAYGROUND_PREVIEW_CHANNEL = 'motiongpu-playground-preview-v1';

/**
 * The preview iframe intentionally has an opaque origin because its sandbox does
 * not include `allow-same-origin`. Source-window and session checks authenticate
 * messages; no serialized origin can target an opaque document.
 */
export const PLAYGROUND_PREVIEW_SANDBOX = 'allow-scripts allow-popups';
export const PLAYGROUND_PREVIEW_TARGET_ORIGIN = '*';
export const PLAYGROUND_PREVIEW_EVENT_ORIGIN = 'null';
