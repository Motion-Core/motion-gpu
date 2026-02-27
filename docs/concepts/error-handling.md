# Error Handling and Diagnostics

Fragkit classifies runtime errors into user-readable reports.

## Error phases

- `initialization`
- `render`

## Error report shape

```ts
interface FragkitErrorReport {
  title: string
  message: string
  hint: string
  details: string[]
  stack: string[]
  rawMessage: string
  phase: 'initialization' | 'render'
}
```

## Built-in classifications

Known message patterns map to specific titles/hints, including:

- WebGPU unavailable
- adapter unavailable
- unsupported canvas WebGPU context
- WGSL compilation failures
- bind group layout mismatches
- invalid texture usage flags

Unknown errors fall back to generic `Fragkit render error` classification.

## Overlay UX

`FragCanvas` renders a portal-based dialog with:

- phase marker
- title + message
- actionable hint
- expandable technical details and stack

This ensures failures are visible without opening devtools.

## Practical debugging flow

1. Start with report title/hint.
2. If WGSL-related, inspect line numbers in details.
3. Verify uniform and texture declarations vs shader bindings.
4. Check texture dimensions and usage expectations.
5. Validate browser WebGPU support and secure context.
