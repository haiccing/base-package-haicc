// node: a node as it is stored, and the nodes a URI selects (README.md
// beside it). Paths are written relative, from the mrepo's root.
import { segmented, joined, stepsOf, selects, ROOT } from 'mycelium-uri'
import { query, shortcutsAt, NODE } from 'mrepo-base-xpath'
import { registry, schemasOf, isSingle, unfold, plain } from 'mycelium-value-avro'

// A node is a folder holding its document under this name (NODE, the
// mrepo's: mrepo-base-xpath).
export { NODE }

// place(uri): where a request's URI (its segments) points: its layer; the
// names below it when it names one node (names; null when it selects: a
// `*` or a filter in it, a query); and uriOf(names): a node's URI in the
// same format, the request's prefix kept.
export function place (segments) {
  const whole = joined(segmented(segments))
  if (whole === ROOT) throw new Error('not a node: . (the mrepo itself; a layer first: main)')
  const [layer, ...steps] = stepsOf(whole)
  const prefix = segments.slice(0, -1)
  const skip = joined(prefix) === ROOT ? 0 : joined(prefix).split('/').length
  const uriOf = of => [...prefix, [layer, ...of].slice(skip).join('/') || ROOT]
  return { segments, layer, names: selects(whole) ? null : steps, uriOf, at: of => of.join('/') || ROOT }
}

const dir = (p, names) => [p.layer, ...names].join('/')
// A document that may not be there: undefined then; one that is there
// and is no document is an error, not a missing one.
// log: none (one read; select says what was found)
const json = async (exec, path) => {
  const bytes = await exec.find(path)
  if (bytes === null) return undefined
  try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${path}`, { cause: err }) }
}
const base = path => path.slice(path.lastIndexOf('/') + 1)
// The install's registry: beside the packages in the store this mrepo's
// packages manifest names.
// log: none (one read; select's caller logs the query)
async function registryOf (exec) {
  const store = (await json(exec, '/packages/manifest.json'))?.store
  if (!store) throw new Error('no registry: the mrepo\'s packages manifest names no store')
  return registry(schemasOf(store))
}

// In main a URI does not run through a shortcut: none of the names above
// the last may be one (through: the last too, for what is below it).
async function inside (exec, p, names, through = false) {
  if (p.layer !== 'main') return
  for (let i = 1; i < names.length + (through ? 1 : 0); i++) {
    const position = names.slice(0, i).join('/')
    if ((await shortcutsAt(exec, position)).length) throw new Error(`${position} is a shortcut: a URI does not run through it (haicc ${position} haicc ${names.slice(i).join('/') || '.'} ...)`)
  }
  exec.log('debug', 'inside', { layer: p.layer, positions: Math.max(0, names.length + (through ? 1 : 0) - 1) })
}

// The names of a node's children: the folders in it that are nodes (each
// holding its document); a hidden folder, or one without, is none.
// log: none (a listing; select says each node and its children)
async function childrenOf (exec, p, names) {
  const found = await exec.select(`${dir(p, names)}/*`)
  const out = []
  for (const [path, n] of found) {
    if (n.type !== 'tree' || base(path).startsWith('.')) continue
    if ((await exec.select(`${path}/${NODE}`)).length) out.push(base(path))
  }
  return out.sort()
}

// nodeAt(exec, p, names): the node there, { uri, value, children }, with
// its shortcuts where it has some (a node that is a link: where its data
// comes from); null when there is none. The layer itself is a node, its
// document {} when it has none.
// log: in select, and in create: each node looked at, at debug
export async function nodeAt (exec, p, names) {
  const value = await json(exec, `${dir(p, names)}/${NODE}`)
  if (value === undefined && names.length) return null
  const node = { uri: p.uriOf(names), value: value ?? {}, children: await childrenOf(exec, p, names) }
  const links = p.layer === 'main' && names.length ? await shortcutsAt(exec, names.join('/')) : []
  return links.length ? { ...node, shortcuts: links } : node
}

// A file's document: JSON, or its text when it is not that; a binary
// record (AVRO, single-object encoded) decoded, every level, by the
// install's registry (the store its packages manifest names).
// log: none (one read; select's caller logs the query)
async function documentOf (exec, node, at) {
  const bytes = await exec.bytes(node)
  if (isSingle(bytes)) return plain(unfold(await registryOf(exec), bytes))
  const text = bytes.toString()
  // catch: not JSON: the file's text is its value
  try { return JSON.parse(text) } catch { return text }
}

// select(exec, p): what the URI selects, an array (nothing there: empty,
// not an error): the nodes, each as nodeAt gives it; a value inside a
// document, { uri, value }; a file, { uri, value }, its value the file's
// document (a record in a layer). A folder without a document is not
// among them. A URI does not run through a
// shortcut: refused, said with the way across. -> [{ names, node, value? }]
// (mode: how the URI is read, mrepo-base-xpath's: physical when none is said)
export async function select (exec, p, { mode = 'physical' } = {}) {
  const result = await query(exec, p.segments, { mode })
  const found = await result.all()
  const stopped = result.stopped()
  if (stopped.length) {
    const [{ at, rest }] = stopped
    throw new Error(`${at} is a shortcut: a URI does not run through it (haicc ${at} haicc ${rest} ...)`)
  }
  const out = []
  for (const f of found) {
    const names = f.at === ROOT ? [] : f.at.split('/')
    if (f.kind === 'value') { out.push({ names, node: { uri: p.uriOf(names), value: f.value }, value: true }); continue }
    // a file is its own document (a record in a layer)
    if (f.kind === 'file') { out.push({ names, node: { uri: p.uriOf(names), value: await documentOf(exec, f.node, p.at(names)) }, file: true }); continue }
    const node = f.kind === 'node' ? await nodeAt(exec, p, names) : null
    exec.log('debug', 'node', { at: p.at(names), there: Boolean(node), children: node?.children.length ?? 0, shortcut: Boolean(node?.shortcuts) })
    if (node) out.push({ names, node })
  }
  return out
}

export { dir as folderOf, inside }
