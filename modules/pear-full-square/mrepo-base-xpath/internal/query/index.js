// query: a request's URI resolved to what it selects in this mrepo, each a
// reference, and where it stopped at a shortcut (README.md beside it).
import { query as select, XPathResult } from 'mycelium-xpath'
import { next, took, addressOf } from 'mycelium-xpath-physical'
import { segmented, joined, stepsOf, isName, unslashed, uriFormOf, ROOT } from 'mycelium-uri'
import { MAIN, SHORTCUTS, NODE, linkOf } from '../shortcut/index.js'

// uri: as a request's form holds it, its segments, the layer first in what
// they make together: ['main', "swarms/*[state='started']"], ['runtime/hooks'].
// mode: how the URI is read: 'physical', as its layer is stored (the
// reading when none is said); 'logical': a topic as its records, how it is
// stored hidden.
export const CONFIG = '.layer.json'
// query: a request's URI as its result, the one way an mrepo is queried:
// an iterator over what it selects in this
// mrepo (mycelium-xpath's XPathResult under it: a node set, logical; its
// slices fetched by physical queries as the reading needs them, each in the
// request's log, batch; each node at its logical address). How many a
// reader takes is its own.
// -> { layer, iterateNext(), take(n), all(), stopped(), metadata(), xpath }
//    iterateNext()  the next reference ({ at, kind, node | value,
//                   shortcut? }), null at the end
//    stopped()      where it stopped at a shortcut, so far
//    metadata()     the result's: the logical query, its physical translation
// log: query, when it is made (its URI, how it is read); its batches, through exec.step (batch)
// (ascending: a topic read from its earliest on; when not said, from its latest back)
export async function query (exec, uri, { mode = 'physical', ascending = false } = {}) {
  const whole = joined(segmented(uri))
  if (whole === ROOT) throw new Error('not a node: . (the mrepo itself; a layer first: main)')
  const [layer, ...steps] = stepsOf(whole)
  if (!isName(layer)) throw new Error(`not a layer: ${layer} (in ${whole}: a name first, without a filter)`)
  return exec.step('query', () => ({ uri: whole, mode }), async () => {
    const root = await exec.node(layer)
    if (!root) return { layer, iterateNext: async () => null, take: async () => [], all: async () => [], stopped: () => [], metadata: () => null, xpath: null }
    // a folder's listing, asked once a query: its children, and what is
    // hidden in it (its document, its shortcuts)
    const listings = new WeakMap()
    const listing = async node => {
      if (!listings.has(node)) {
        listings.set(node, (await exec.children(node)) ?? null)
      }
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
        links.set(ref.path, Array.isArray(list) && list.length ? await linkOf(exec, unslashed(ref.path), list[0]) : null)
      }
      return links.get(ref.path)
    }
    const tree = {
      // (hidden: a name starting with a dot is no URI's: a node's document, its
      // shortcuts, a layer's own config; by the name's rule, no name singled out)
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
      // (the URI documentation, base-docs-uri: publicKey is public-key), in a filter too
      name: uriFormOf,
      step: (event, data, fn) => exec.step(event, data, fn)
    }
    // what the query answers: a node set (mycelium-xpath), logical: the
    // request, its storage's structure type; its data loaded a batch at a
    // time, each by a physical query (mycelium-xpath-physical gives its
    // text from the node set, the engine executes it on the tree as it is
    // stored), each seen in the request's log (batch). A layer's
    // structure type: a plain tree, read as it is: logical = physical.
    // Read to its end here: every action gets all of it.
    // Read logically, a topic: the layer itself or the first of the URI's
    // plain leading names whose folder says a structure of records (its
    // config, the physical side's file). Its node set is fixed by the
    // topic's latest offset now (one physical query, seen as a batch is),
    // and its batches come from that structure's generator.
    const logical = steps.join('/')
    const run = text => select(tree, root, text)
    const observe = (event, fn) => exec.step('batch', r => ({ ...event, returned: r.found.length }), fn)
    let topic = null
    if (mode === 'logical') {
      let [node, at] = [root, []]
      // (a folder, whatever holds it: a tree, a layer's branches)
      for (let i = 0; node && node.type !== 'blob'; i++) {
        const structure = (await hidden(node, CONFIG, `/${at.join('/')}`))?.structure
        if (structure?.type === 'offset-files') { topic = { levels: [5, 6], batch: 50, ...structure, topic: at.join('/'), extension: 'json' }; break }
        if (i >= steps.length || !isName(steps[i])) break
        node = (await listing(node))?.find(([n]) => n === steps[i])?.[1] ?? null
        at = [...at, steps[i]]
      }
    }
    let fixed = null
    if (topic) {
      const latest = [topic.topic, ...Array(topic.levels.length + 1).fill('*[last()]')].filter(Boolean).join('/')
      const there = (await observe({ logical, mode, type: topic.type, from: null, physical: latest, fixes: true }, () => run(latest))).found[0]
      fixed = there ? Number(there.path.slice(there.path.lastIndexOf('/') + 1, -(topic.extension.length + 1))) : null
    }
    const xpath = new XPathResult({ query: logical, mode: topic ? 'logical' : 'physical', layer, ascending: Boolean(topic) && ascending }, { physical: topic ?? { type: 'tree' }, fixed, next, took, address: addressOf, run, observe })
    // a node found, as this mrepo's reference: where it is (its logical
    // address), what it is
    const refOf = async f => {
      const at = unslashed(f.path)
      if (!('node' in f)) return { at, kind: 'value', value: f.value }
      if (f.node.type === 'blob') return { at, kind: 'file', node: f.node }
      // a folder is a node when it holds its document; a layer is one
      const node = f.stored === '/' || Boolean((await listing(f.node))?.some(([n, child]) => n === NODE && child.type === 'blob'))
      const shortcut = await linkAt({ path: f.stored, node: f.node })
      return { at, kind: node ? 'node' : 'folder', node: f.node, ...(shortcut ? { shortcut } : {}) }
    }
    const iterator = xpath.iterator()
    const iterateNext = async () => { const f = await iterator.iterateNext(); return f === null ? null : refOf(f) }
    const take = async n => { const out = []; for (let ref; out.length < n && (ref = await iterateNext()) !== null;) out.push(ref); return out }
    return {
      layer,
      xpath,
      iterateNext,
      take,
      all: () => take(Infinity),
      stopped: () => xpath.stopped.map(s => ({ at: unslashed(s.path), rest: s.rest, shortcut: s.why })),
      // (the node set as data, its nodes left out: what was asked, how it was read)
      metadata: () => xpath.metadata
    }
  })
}
