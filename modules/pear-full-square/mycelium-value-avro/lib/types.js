// AVRO types (avsc, Bare's fork), with our logical types:
//   json              a record of one string, its JSON text: in memory any
//                     JSON value (base-docs-uri, "Data shapes": the declared
//                     json type, for the named edges)
//   timestamp-millis  a long, milliseconds since the epoch: in memory its
//                     ISO 8601 text, as a record's timestamp is in JSON
// And is-like: whether a writer's data reads as a reader's schema, AVRO's
// resolution with record names not required to match.
import avsc from 'avsc'
import { fingerprintOf } from './fingerprint.js'

class Json extends avsc.types.LogicalType {
  _fromValue (v) { return JSON.parse(v.text) }
  _toValue (v) { return v === undefined ? undefined : { text: JSON.stringify(v) } }
  _resolve (type) { if (avsc.Type.isType(type, 'logical:json')) return v => v }
}

class Timestamp extends avsc.types.LogicalType {
  _fromValue (ms) { return new Date(Number(ms)).toISOString() }
  _toValue (iso) {
    if (typeof iso !== 'string') return undefined
    const ms = Date.parse(iso)
    return Number.isNaN(ms) ? undefined : ms
  }

  // (the writer's read gives its value: ISO text from ours, a number from a long)
  _resolve (type) {
    if (avsc.Type.isType(type, 'logical:timestamp-millis')) return v => v
    if (avsc.Type.isType(type, 'long', 'int')) return v => this._fromValue(v)
  }
}

export const LOGICAL = { json: Json, 'timestamp-millis': Timestamp }

// A schema (JSON) -> its type (a union of several records wrapped, as
// AVRO's JSON does: { <fullname>: value }; others plain); named types it refers to found in `named`
// (fullname -> type), and those it defines added there.
export function typeOf (schema, named = {}) {
  return avsc.Type.forSchema(schema, { logicalTypes: LOGICAL, registry: named, wrapUnions: 'auto' })
}

// A type's Parsing Canonical Form and its fingerprint; and the schema whole,
// self-contained (every named type it uses defined in it, its attributes
// kept): what the registry stores.
export const canonicalOf = type => JSON.stringify(type.schema())
export const fingerprint = type => fingerprintOf(canonicalOf(type))
export const wholeOf = type => type.schema({ exportAttrs: true })

// Is and is-like, one mechanism: AVRO's own resolution, unchanged, a
// record matched by its name without the namespace, as the specification
// says (avsc compares full names unless told: ignoreNamespaces).
//   is        the same core type (the name; any variant, its namespace),
//             or a declared alias: versions and variants of one type,
//             evolved within the rules (base-docs-uri, "Core types")
//   is-like   a different core type read as another: aliases generated
//             for the read, the writer's schema and the reader's walked
//             side by side, each named type of the reader's whose core
//             type differs given the writer's fullname at the same position
//             (a record's fields by name, an array's items, a map's
//             values, a union's branch by structure, first fit in order);
//             then the same resolution. Deterministic; the aliases
//             applied part of the answer.
const NAMED = ['record', 'error', 'enum', 'fixed']
const kind = s => (typeof s === 'string' ? s : Array.isArray(s) ? 'union' : s?.type)
const fullname = s => s?.name ?? null
const core = s => { const n = fullname(s); return n === null ? null : n.slice(n.lastIndexOf('.') + 1) }
const OPTS = { ignoreNamespaces: true }

// writer, reader: whole schemas (every named type defined at its first
// use). -> { reader: the reader's schema with the aliases, aliases:
// { <reader's fullname>: [<writer's fullname>...] } }
function aliasesFor (writer, reader) {
  const wDefs = new Map()
  const rDefs = new Map()
  const index = (s, defs) => {
    if (Array.isArray(s)) return s.forEach(b => index(b, defs))
    if (!s || typeof s !== 'object') return
    if (NAMED.includes(s.type) && s.name) defs.set(s.name, s)
    for (const f of s.fields ?? []) index(f.type, defs)
    if (s.items) index(s.items, defs)
    if (s.values) index(s.values, defs)
    if (s.type && typeof s.type === 'object') index(s.type, defs)
  }
  index(writer, wDefs); index(reader, rDefs)
  const deref = (s, defs) => (typeof s === 'string' && defs.has(s) ? defs.get(s) : s)
  const aliases = {}
  const seen = new Set()
  const walk = (w, r) => {
    w = deref(w, wDefs); r = deref(r, rDefs)
    if (Array.isArray(r) || Array.isArray(w)) {
      // a union: each writer's branch to the first reader's branch of its
      // kind that it reads as (by structure), in order
      const ws = Array.isArray(w) ? w : [w]
      const rs = Array.isArray(r) ? r : [r]
      for (const wb of ws) {
        const wd = deref(wb, wDefs)
        if (!NAMED.includes(kind(wd))) continue
        for (const rb of rs) {
          const rd = deref(rb, rDefs)
          if (kind(rd) !== kind(wd)) continue
          if (fits(wd, rd)) { walk(wd, rd); break }
        }
      }
      return
    }
    if (!w || !r || typeof w !== 'object' || typeof r !== 'object' || kind(w) !== kind(r)) return
    if (NAMED.includes(r.type) && fullname(w) && core(w) !== core(r)) {
      const key = `${fullname(w)}>${fullname(r)}`
      if (seen.has(key)) return
      seen.add(key)
      const list = aliases[fullname(r)] ??= []
      if (!list.includes(fullname(w)) && !(r.aliases ?? []).includes(fullname(w))) list.push(fullname(w))
    }
    if (r.type === 'record') for (const rf of r.fields) { const wf = w.fields.find(f => f.name === rf.name || (rf.aliases ?? []).includes(f.name)); if (wf) walk(wf.type, rf.type) }
    else if (r.type === 'array') walk(w.items, r.items)
    else if (r.type === 'map') walk(w.values, r.values)
  }
  // (a union's branch by structure: does the writer's read as it, aliased)
  const fits = (w, r) => {
    // catch: a branch it does not read as: the next one is tried
    try { const a = aliasesFor(w, r); typeOf(a.reader, {}).createResolver(typeOf(w, {}), OPTS); return true } catch { return false }
  }
  walk(writer, reader)
  const apply = s => {
    if (Array.isArray(s)) return s.map(apply)
    if (!s || typeof s !== 'object') return s
    const out = { ...s }
    if (NAMED.includes(s.type) && aliases[s.name]) out.aliases = [...(s.aliases ?? []), ...aliases[s.name]]
    if (s.fields) out.fields = s.fields.map(f => ({ ...f, type: apply(f.type) }))
    if (s.items) out.items = apply(s.items)
    if (s.values) out.values = apply(s.values)
    if (s.type && typeof s.type === 'object') out.type = apply(s.type)
    return out
  }
  return { reader: apply(reader), aliases }
}

// writer, reader: types -> { reader, resolver, aliases }: the reader to
// read with (the aliases on it: is-like) and its resolver; throws, saying
// why, when it does not read as it. Cached per (writer, reader) pair: the
// writer by its fingerprint, the reader by its whole schema (its defaults
// and aliases, which the fingerprint leaves out, change the read).
const cache = new Map()
export function resolverOf (writer, reader, { like = true } = {}) {
  const key = `${fingerprint(writer)}:${JSON.stringify(wholeOf(reader))}:${like}`
  if (cache.has(key)) return cache.get(key)
  let r = { reader, resolver: null, aliases: {} }
  if (like) {
    const a = aliasesFor(wholeOf(writer), wholeOf(reader))
    if (Object.keys(a.aliases).length) r = { reader: typeOf(a.reader, {}), resolver: null, aliases: a.aliases }
  }
  r.resolver = r.reader.createResolver(writer, OPTS)
  cache.set(key, r)
  return r
}

// -> { like: true, aliases } or { like: false, why }
export function isLike (writer, reader) {
  try { return { like: true, aliases: resolverOf(writer, reader).aliases } } catch (err) { return { like: false, why: err.message } }
}
// -> { is: true } or { is: false, why }: AVRO's own, names as declared
export function is (writer, reader) {
  try { resolverOf(writer, reader, { like: false }); return { is: true } } catch (err) { return { is: false, why: err.message } }
}
