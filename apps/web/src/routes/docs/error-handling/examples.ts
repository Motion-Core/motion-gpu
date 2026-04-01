export const minimalErrorSvelte = `\
<FragCanvas
  {material}
  onError={(report) => {
    console.error(
      \`[\${report.code}] (\${report.severity}) [\${report.phase}] \${report.title}: \${report.message}\`
    );
    if (report.hint) console.info(\`Hint: \${report.hint}\`);
  }}
  showErrorOverlay={false}
/>`;

export const minimalErrorReact = `\
<FragCanvas
  material={material}
  onError={(report) => {
    console.error(
      \`[\${report.code}] (\${report.severity}) [\${report.phase}] \${report.title}: \${report.message}\`
    );
    if (report.hint) console.info(\`Hint: \${report.hint}\`);
  }}
  showErrorOverlay={false}
/>`;

export const errorHistorySvelte = `\
<FragCanvas
  {material}
  errorHistoryLimit={10}
  onErrorHistory={(history) => {
    const latest = history[history.length - 1];
    if (!latest) return;
    console.info(\`Recent errors: \${history.length}, latest code: \${latest.code}\`);
  }}
/>`;

export const errorHistoryReact = `\
<FragCanvas
  material={material}
  errorHistoryLimit={10}
  onErrorHistory={(history) => {
    const latest = history[history.length - 1];
    if (!latest) return;
    console.info(\`Recent errors: \${history.length}, latest code: \${latest.code}\`);
  }}
/>`;

export const customRendererSvelte = `\
{#snippet myErrorRenderer(report)}
  <aside class="error-banner">
    <strong>{report.title}</strong>
    <p>{report.message}</p>
  </aside>
{/snippet}

<FragCanvas
  {material}
  errorRenderer={myErrorRenderer}
  onError={(report) => {
    console.error(report);
  }}
/>`;

export const customRendererReact = `\
<FragCanvas
  material={material}
  errorRenderer={(report) => (
    <aside className="error-banner">
      <strong>{report.title}</strong>
      <p>{report.message}</p>
    </aside>
  )}
  onError={(report) => {
    console.error(report);
  }}
/>`;
