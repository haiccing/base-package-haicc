// The registry, an install's: an index, not a gatekeeper. What a
// fingerprint is, and what a name has been: schemas by their URI (their
// fullname's, where it maps), by their fingerprint. It never refuses a valid
// schema; no subjects bound to topics, no global ids, no compatibility modes:
// whether data reads as a schema is the reader's question (isLike).
//   const reg = registry(folder)   null: in memory only; an install's,
//                                  registry(schemasOf(store))
//   reg.add(schema, { commit }) -> { fingerprint, uri, added } (added: new
//                            here; commit: the one that brought it)
//   reg.types()              -> the core types: [name...]
//   reg.variants(type)       -> its variants: [{ variant, uri }]
//   reg.versions(uri)        -> a variant's versions: [{ fingerprint, commit }]
//   reg.get(fingerprint)     -> { fingerprint, uri, schema } or null
//   reg.type(fingerprint)    -> its type; throws for one not known
//   reg.named(uri)           -> its fingerprints, the oldest first
//   reg.typeOf(schema)       -> its type, not added (a reader's)
//   reg.latest(uri)          -> the type last added under it, or null
//   reg.list()               -> [{ fingerprint, uri }]
// Stored as a folder of documents, plain JSON, one a schema, named by its
// fingerprint: { fingerprint, uri, commit, added, schema } (the schema whole, every named
// type it uses defined in it). Written by whoever registers (the creator, at
// deploy); read by every process of the install: a fingerprint not known in
// memory is looked for in the folder again. The module's own schemas (the
// record, json) are always known.
import { join } from 'bare-path'
import { documents } from 'mycelium-container-document'
import * as json from 'mycelium-value-json'
import { typeOf, fingerprint, wholeOf } from './types.js'
import { uriOf, fullnameOf, partsOf } from './names.js'
import RECORD from '../schemas/record.json' with { type: 'json' }
import JSON_TYPE from '../schemas/json.json' with { type: 'json' }

export const OWN = [JSON_TYPE, RECORD]

// An install's registry: beside its packages, in the store (<store>/schemas).
export const schemasOf = store => join(store, 'schemas')

// The fullnames of the named types a schema defines.
function definedIn (schema, ns = null, out = []) {
  if (Array.isArray(schema)) { for (const b of schema) definedIn(b, ns, out); return out }
  if (!schema || typeof schema !== 'object') return out
  if (['record', 'error', 'enum', 'fixed'].includes(schema.type) && typeof schema.name === 'string') {
    const space = schema.name.includes('.') ? schema.name.slice(0, schema.name.lastIndexOf('.')) : schema.namespace ?? ns
    out.push(schema.name.includes('.') || !space ? schema.name : `${space}.${schema.name}`)
    for (const f of schema.fields ?? []) definedIn(f.type, space, out)
    return out
  }
  if (schema.type === 'array') definedIn(schema.items, ns, out)
  if (schema.type === 'map') definedIn(schema.values, ns, out)
  if (typeof schema.type === 'object') definedIn(schema.type, ns, out)
  return out
}

// When a schema is added: in one process strictly increasing, so their
// order is kept.
let last = 0
const now = () => { last = Math.max(Date.now(), last + 1); return new Date(last).toISOString() }

export function registry (folder = null) {
  const box = folder ? documents(folder, json) : null
  const byPrint = new Map() // fingerprint -> { fingerprint, uri, schema, type, at }
  const byUri = new Map() // uri -> [fingerprint...]
  let order = 0
  const named = {} // fullname -> type: what the schemas added define
  const keep = (fp, uri, schema, type, commit, added) => {
    if (byPrint.has(fp)) return byPrint.get(fp)
    const e = { fingerprint: fp, uri, schema, type, commit, added, at: order++ }
    byPrint.set(fp, e)
    if (uri) byUri.set(uri, [...(byUri.get(uri) ?? []), fp])
    return e
  }
  // A schema -> its entry: self-contained, or naming types added before it
  // (by name: the last added of that name).
  // A schema as a type, not added: self-contained, or naming types known.
  const make = schema => {
    // catch: not self-contained: made again against the named types known
    // (but those it defines itself: a version of its own)
    try { return typeOf(schema, {}) } catch {
      const known = { ...named }
      for (const n of definedIn(schema)) delete known[n]
      return typeOf(schema, known)
    }
  }
  const enter = (schema, { commit = null, added = now() } = {}) => {
    const t = make(schema)
    const fp = fingerprint(t)
    if (byPrint.has(fp)) return { entry: byPrint.get(fp), added: false }
    const whole = wholeOf(t)
    // the types it defines, by name, for those that follow
    const defined = {}
    typeOf(whole, defined)
    Object.assign(named, defined)
    const name = t.name ?? t.underlyingType?.name
    return { entry: keep(fp, name ? uriOf(name) : null, whole, t, commit, added), added: true }
  }
  for (const s of OWN) enter(s)
  // The folder read again: what other processes registered since.
  // In the order they were added (a version's order: the commit that
  // brought it, as deploys bring them).
  const reload = () => {
    if (!box) return
    const docs = []
    for (const name of box.list()) {
      if (byPrint.has(name)) continue
      // catch: a document not whole: read again the next time
      try { docs.push(box.read(name)) } catch {}
    }
    docs.sort((a, b) => String(a.added).localeCompare(String(b.added)) || (a.fingerprint < b.fingerprint ? -1 : 1))
    // catch: not a schema: not taken, said by type()
    for (const d of docs) { try { enter(d.schema, { commit: d.commit ?? null, added: d.added ?? null }) } catch {} }
  }
  reload()
  const reg = {
    folder,
    add (schema, { commit = null } = {}) {
      const { entry, added } = enter(schema, { commit })
      if (box && !box.list().includes(entry.fingerprint)) box.write(entry.fingerprint, { fingerprint: entry.fingerprint, uri: entry.uri, commit: entry.commit, added: entry.added, schema: entry.schema })
      return { fingerprint: entry.fingerprint, uri: entry.uri, added }
    },
    get (fp) {
      if (!byPrint.has(fp)) reload()
      const e = byPrint.get(fp)
      return e ? { fingerprint: e.fingerprint, uri: e.uri, schema: e.schema } : null
    },
    type (fp) {
      if (!byPrint.has(fp)) reload()
      const e = byPrint.get(fp)
      if (!e) throw new Error(`unknown schema: ${fp} (not in the registry${folder ? `, ${folder}` : ''})`)
      return e.type
    },
    typeOf: make,
    named (uri) { reload(); return [...(byUri.get(uri) ?? [])] },
    latest (uri) { const fps = reg.named(uri); return fps.length ? byPrint.get(fps[fps.length - 1]).type : null },
    // The three questions: what core types there are; the variants of a
    // type (by namespace); the versions of a variant (by fingerprint, in
    // the order the commits brought them). No version numbers.
    types () { return [...new Set(reg.list().filter(e => e.uri).map(e => partsOf(fullnameOf(e.uri)).type))].sort() },
    variants (type) { return [...new Set(reg.list().filter(e => e.uri && partsOf(fullnameOf(e.uri)).type === type).map(e => e.uri))].map(uri => ({ variant: partsOf(fullnameOf(uri)).variant, uri })) },
    versions (uri) { return reg.named(uri).map(fp => ({ fingerprint: fp, commit: byPrint.get(fp).commit })) },
    list () { reload(); return [...byPrint.values()].sort((a, b) => a.at - b.at).map(e => ({ fingerprint: e.fingerprint, uri: e.uri })) }
  }
  return reg
}
