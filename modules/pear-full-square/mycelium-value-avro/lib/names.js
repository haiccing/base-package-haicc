// A schema's name is its URI, where it comes from (<org>/<package>/<name>,
// a module's <org>/<module>/<name>); its AVRO fullname by the data-name
// mapping (base-docs-uri, "Data names"), exact both ways, each part its
// data name: the name the core type, the namespace its variant's context
// (base-docs-avro, "Core types").
//   haiccing/base-package-help/annotate-answer
//   haiccing.basePackageHelp.annotateAnswer
import { dataNameOf, uriFormOf, isDataName } from 'mycelium-uri'

// uri -> fullname; throws when a segment is not a data name's URI form.
export function fullnameOf (uri) {
  const parts = String(uri).split('/')
  if (parts.length < 2) throw new Error(`not a schema's URI: ${uri} (<org>/<package>/<name>)`)
  return parts.map(dataNameOf).join('.')
}

// fullname -> uri; null when the name does not map (a schema from elsewhere:
// still valid, known by its fingerprint only).
export function uriOf (fullname) {
  const parts = String(fullname).split('.')
  if (parts.length < 2 || !parts.every(isDataName)) return null
  return parts.map(uriFormOf).join('/')
}

// A fullname's two parts: its core type (the name) and its variant (the
// namespace).
export function partsOf (fullname) {
  const s = String(fullname)
  const i = s.lastIndexOf('.')
  return { type: i < 0 ? s : s.slice(i + 1), variant: i < 0 ? null : s.slice(0, i) }
}
