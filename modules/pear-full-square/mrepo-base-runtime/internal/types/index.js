// types: what a runtime checks by: the types its own mrepo holds, in its
// avro layer (README.md beside it).
import { typeOf, valid, uriOf, primitiveOf } from 'mycelium-avro'

// Where an mrepo holds its types: its avro layer, a file a type at its URI.
export const HELD = '/avro/types'
export const fileOf = uri => `${HELD}/${uri}.avsc`

// The named types a schema refers to and does not define itself.
function refers (schema) {
  const defined = new Set()
  const used = new Set()
  const walk = s => {
    if (typeof s === 'string') { if (s.includes('.')) used.add(s); return }
    if (Array.isArray(s)) return s.forEach(walk)
    if (!s || typeof s !== 'object') return
    if (typeof s.name === 'string' && ['record', 'enum', 'fixed', 'error'].includes(s.type)) defined.add(s.name)
    for (const f of s.fields ?? []) walk(f.type)
    if (s.items) walk(s.items)
    if (s.values) walk(s.values)
    if (s.type && typeof s.type === 'object') walk(s.type)
  }
  walk(schema)
  return [...used].filter(n => !defined.has(n))
}

// typesOf(repo) -> { held, type(uri), valid(uri, value) }: every type the
// mrepo holds read once, as its runtime starts; from then a check reads
// nothing (a type never changes under its fingerprint). A type made when
// first asked, the types it names made first. What cannot be read is
// thrown, with the file: a runtime does not start on types it cannot read.
// log: none (reads only; whoever asks says what it did)
export async function typesOf (repo) {
  const schemas = new Map()
  // (no avro layer, or nothing in it: the selection is empty, it holds none)
  for (const [path] of await repo.select(`${HELD}/*/*/*`)) {
    if (!path.endsWith('.avsc')) continue
    const text = (await repo.read(path)).toString()
    // catch: not JSON: said with the file it is
    try { schemas.set(path.slice(HELD.length + 1, -'.avsc'.length), JSON.parse(text)) } catch (err) { throw new Error(`not a type's file: ${path} (${err.message})`, { cause: err }) }
  }
  const named = {}
  const types = new Map()
  const type = uri => {
    if (types.has(uri)) return types.get(uri)
    // one of AVRO's own, by its URI (avro/<name>): held by every mrepo, no file
    // (avro/ and none of them: said by primitiveOf)
    const own = typeof uri === 'string' ? primitiveOf(uri) : null
    if (own) { types.set(uri, own); return own }
    if (typeof uri !== 'string' || !uri || uri.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`not a type's name: ${uri}`)
    const schema = schemas.get(uri)
    if (!schema) throw new Error(`type not held: ${uri} (not in this mrepo's avro layer, ${fileOf(uri)}; a type not held is the schema registry's to give)`)
    for (const name of refers(schema)) {
      if (name in named) continue
      const other = uriOf(name)
      if (!other) throw new Error(`type not held: ${name}, named in ${uri} (no URI for that name)`)
      type(other)
    }
    // made beside what is known so far: a schema that fails leaves no name behind
    const known = { ...named }
    const t = typeOf(schema, known)
    Object.assign(named, known)
    types.set(uri, t)
    return t
  }
  return { held: [...schemas.keys()].sort(), type, valid: (uri, value) => valid(type(uri), value) }
}
