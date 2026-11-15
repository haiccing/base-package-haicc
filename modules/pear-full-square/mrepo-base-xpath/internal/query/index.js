// query: a request's URI resolved to what it selects in this mrepo, each a
// reference, and where it stopped at a shortcut (README.md beside it).
import { query as select } from 'mycelium-xpath'
import { segmented, joined, stepsOf, isName, unslashed, uriFormOf, ROOT } from 'mycelium-uri'
import { MAIN, SHORTCUTS, linkOf } from '../shortcut/index.js'

// A node is a folder holding its document under this name: hidden (no URI
// has a name starting with a dot), and what keeps the folder in git.
export const NODE = '.node.json'

// uri: as a request's form holds it, its segments, the layer first in what
// they make together: ['main', "swarms/*[state='started']"], ['runtime/hooks'].
export async function query (exec, uri) {
  const whole = joined(segmented(uri))
  if (whole === ROOT) throw new Error('not a node: . (the mrepo itself; a layer first: main)')
  const [layer, ...steps] = stepsOf(whole)
  if (!isName(layer)) throw new Error(`not a layer: ${layer} (in ${whole}: a name first, without a filter)`)
  return exec.step('query', r => ({ uri: whole, found: r.found.length, stopped: r.stopped.length }), async () => {
    const root = await exec.node(layer)
    if (!root) return { layer, found: [], stopped: [] }
    // a folder's listing, asked once a query: its children, and what is
    // hidden in it (its document, its shortcuts)
    const listings = new WeakMap()
    const listing = async node => {
      if (!listings.has(node)) listings.set(node, (await exec.children(node)) ?? null)
      return listings.get(node)
    }
    const hidden = async (node, name, at) => {
      const entry = (await listing(node))?.find(([n, child]) => n === name && child.type === 'blob')
      if (!entry) return undefined
      const bytes = await exec.bytes(entry[1])
      try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${layer}${at === '/' ? '' : at}/${name}`, { cause: err }) }
    }
    // a position's shortcut: in main, below its root; the first source
    const links = new Map()
    const linkAt = async ref => {
      if (layer !== MAIN || ref.path === '/' || ref.node.type !== 'tree') return null
      if (!links.has(ref.path)) {
        const list = await hidden(ref.node, SHORTCUTS, ref.path)
        links.set(ref.path, Array.isArray(list) && list.length ? linkOf(exec, unslashed(ref.path), list[0]) : null)
      }
      return links.get(ref.path)
    }
    const tree = {
      children: async node => (await listing(node))?.filter(([n]) => !n.startsWith('.')) ?? null,
      // a folder's document is its hidden file; a file's is the file: JSON,
      // or its text when it is not that
      document: async (node, ref) => {
        if (node.type !== 'blob') return (await hidden(node, NODE, ref.path)) ?? null
        const text = (await exec.bytes(node)).toString()
        // catch: not JSON: the file's text is its value
        try { return JSON.parse(text) } catch { return text }
      },
      stop: linkAt,
      // a document's key is a data name: in a URI it takes its URI form
      // (rules.md: publicKey is public-key), in a filter too
      name: uriFormOf,
      step: (event, data, fn) => exec.step(event, data, fn)
    }
    const r = await select(tree, root, steps.join('/'))
    const found = []
    for (const f of r.found) {
      const at = unslashed(f.path)
      if (!('node' in f)) { found.push({ at, kind: 'value', value: f.value }); continue }
      if (f.node.type === 'blob') { found.push({ at, kind: 'file', node: f.node }); continue }
      // a folder is a node when it holds its document; a layer is one
      const node = f.path === '/' || Boolean((await listing(f.node))?.some(([n, child]) => n === NODE && child.type === 'blob'))
      const shortcut = await linkAt(f)
      found.push({ at, kind: node ? 'node' : 'folder', node: f.node, ...(shortcut ? { shortcut } : {}) })
    }
    return { layer, found, stopped: r.stopped.map(s => ({ at: unslashed(s.path), rest: s.rest, shortcut: s.why })) }
  })
}
