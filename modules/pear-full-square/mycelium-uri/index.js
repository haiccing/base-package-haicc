// mycelium-uri — our URIs and names: validate, parse, split at known
// prefixes; names and data names (base-docs-uri). The one validator for both.
// Plain, pure functions: a run reproduces them from their arguments.

export { isSegment, validate, sameName, isUri, parse, format, join, parent, split } from './lib/uri.js'
export { relative, stepsOf, selects, from, within, slashed, unslashed, segmented, joined, positionOf, ROOT } from './lib/relative.js'
export { isName, validateName, isDataName, validateDataName, uriFormOf, dataNameOf, isHidden, HIDDEN } from './lib/names.js'
