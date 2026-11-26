// registry: the runtime's one way to a type: asked of the schema registry,
// by the type's name, its URI (README.md beside it).
import { readFileSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { typeOf, valid, uriOf } from 'mycelium-avro'

// Where the schema registry is: its mrepo's position by its unique URI,
// its avro layer's folder. The warm boot mounts its skeleton there; the
// registry component, deployed there, takes it over: the same place.
export const REGISTRY = 'local/avro-registry'
export const LAYER = 'avro'
export const mountOf = work => join(work, 'mrepos', ...REGISTRY.split('/'), LAYER)

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

// registryOf(work) -> { type(uri), valid(uri, value), mount }: a type read
// once, kept (a type never changes under its name here: a new version is
// the registry's to bring); the types it refers to read first, by their
// names.
// log: none (reads only; whoever asks says what it did)
export function registryOf (work) {
  const mount = mountOf(work)
  const named = {}
  const types = new Map()
  const type = uri => {
    if (types.has(uri)) return types.get(uri)
    if (typeof uri !== 'string' || !uri || uri.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`not a type's name: ${uri}`)
    const file = join(mount, ...uri.split('/')) + '.avsc'
    if (!existsSync(file)) throw new Error(`unknown type: ${uri} (not in the schema registry, ${mount})`)
    const schema = JSON.parse(readFileSync(file, 'utf8'))
    for (const name of refers(schema)) {
      if (name in named) continue
      const other = uriOf(name)
      if (!other) throw new Error(`unknown type: ${name}, named in ${uri} (no URI for that name)`)
      type(other)
    }
    const t = typeOf(schema, named)
    types.set(uri, t)
    return t
  }
  return { mount, type, valid: (uri, value) => valid(type(uri), value) }
}
