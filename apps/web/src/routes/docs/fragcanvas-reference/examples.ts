export const importsSvelte = `import { FragCanvas } from '@motion-core/motion-gpu/svelte';`;

export const importsReact = `import { FragCanvas } from '@motion-core/motion-gpu/react';`;

export const fullConfigSvelte = `\
<FragCanvas
  material={material}
  clearColor={[0.05, 0.05, 0.1, 1]}
  outputColorSpace="srgb"
  renderMode="on-demand"
  autoRender={true}
  maxDelta={0.05}
  dpr={2}
  passes={[tonePass, vignettePass]}
  renderTargets={{ halfRes: { scale: 0.5 } }}
  adapterOptions={{ powerPreference: 'high-performance' }}
  showErrorOverlay={true}
  errorRenderer={myErrorRenderer}
  onError={(report) => sendToTelemetry(report)}
  errorHistoryLimit={20}
  onErrorHistory={(history) => sendErrorHistory(history)}
  class="my-canvas-container"
  style="border-radius: 12px; overflow: hidden;"
>
  <Runtime />
</FragCanvas>`;

export const fullConfigReact = `\
<FragCanvas
  material={material}
  clearColor={[0.05, 0.05, 0.1, 1]}
  outputColorSpace="srgb"
  renderMode="on-demand"
  autoRender={true}
  maxDelta={0.05}
  dpr={2}
  passes={[tonePass, vignettePass]}
  renderTargets={{ halfRes: { scale: 0.5 } }}
  adapterOptions={{ powerPreference: 'high-performance' }}
  showErrorOverlay={true}
  errorRenderer={(report) => (
    <aside className="my-error-banner">
      <strong>{report.title}</strong>
      <p>{report.message}</p>
    </aside>
  )}
  onError={(report) => sendToTelemetry(report)}
  errorHistoryLimit={20}
  onErrorHistory={(history) => sendErrorHistory(history)}
  className="my-canvas-container"
  style={{ borderRadius: '12px', overflow: 'hidden' }}
>
  <Runtime />
</FragCanvas>`;

export const errorSnippetSvelte = `\
{#snippet myErrorRenderer(report)}
  <aside class="my-error-banner">
    <strong>{report.title}</strong>
    <p>{report.message}</p>
  </aside>
{/snippet}`;

export const errorSnippetReact = `\
// In React, pass an inline render function to errorRenderer:
errorRenderer={(report) => (
  <aside className="my-error-banner">
    <strong>{report.title}</strong>
    <p>{report.message}</p>
  </aside>
)}`;
