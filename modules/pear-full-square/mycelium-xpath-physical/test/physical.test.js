import test from 'brittle'
import { query, nodeset, reader, XPathResult } from 'mycelium-xpath'
import { next, took, addressOf, isType, TYPES } from '../index.js'

const root = { swarms: { 'swarm-1': { nodes: { 'node-1': {}, 'node-2': {} } }, 'swarm-2': { nodes: {} } }, notes: {} }
const tree = { children: node => (node !== null && typeof node === 'object' ? Object.entries(node) : null) }
const paths = nodes => nodes.map(n => n.path)

test('the structure types there are; one not there is said', (t) => {
  t.alike(Object.keys(TYPES), ['tree', 'offset-files'])
  t.ok(isType('tree') && isType('offset-files'))
  t.absent(isType('avro-container'), 'not built yet')
  t.absent(isType('toString'), 'a name of the object\'s own is none')
  t.exception(() => next(nodeset({ query: 'swarms/*' }, { type: 'parquet' })), /not a structure type: parquet \(tree, offset-files\)/)
})

test('tree: its physical query is the logical one, once; its result the whole answer', (t) => {
  const set = nodeset({ query: 'swarms/*', layer: 'main' })
  t.alike(set, { logical: { query: 'swarms/*', mode: 'physical', layer: 'main' }, fixed: null, reached: null, physical: { type: 'tree' }, nodes: [], stopped: [], done: false }, 'a node set, made: the request, its storage, nothing loaded')
  t.is(next(set), 'swarms/*', 'the physical XPath: the logical one')
  const step = took(set, 'swarms/*', { found: [{ path: '/swarms/swarm-1' }], stopped: [] })
  t.alike(step, { nodes: [{ path: '/swarms/swarm-1' }], stopped: [], reached: 'end', done: true, full: true })
  t.is(next({ ...set, reached: 'end' }), null, 'read to its end: no more')
})

test('a node set read: nothing loaded until it is asked; a batch by a physical query, seen; the answer the engine gives', async (t) => {
  const seen = []
  const ran = []
  const set = nodeset({ query: 'swarms/*/nodes/*' })
  const read = reader(set, { next, took, run: text => { ran.push(text); return query(tree, root, text) }, observe: async (event, fn) => { const r = await fn(); seen.push({ ...event, returned: r.found.length }); return r } })
  t.alike([set.nodes, set.done, ran], [[], false, []], 'made: no data in it, nothing run')
  const batch = await read.more()
  t.alike(paths(batch), ['/swarms/swarm-1/nodes/node-1', '/swarms/swarm-1/nodes/node-2'], 'its first batch')
  t.alike(paths(batch), paths((await query(tree, root, 'swarms/*/nodes/*')).found), 'what the engine answers for the query')
  t.alike([set.reached, set.done, paths(set.nodes)], ['end', true, paths(batch)], 'the node set now: read to its end, its nodes loaded')
  t.alike(seen, [{ logical: 'swarms/*/nodes/*', mode: 'physical', type: 'tree', from: null, physical: 'swarms/*/nodes/*', returned: 2 }], 'the physical query seen: from where, its text, how many came')
  t.is(await read.more(), null, 'no more')
  t.is(ran.length, 1, 'nothing run again')
  t.alike(JSON.parse(JSON.stringify(set)).logical, set.logical, 'it travels as data')
})

test('a node set read to its end, and node by node', async (t) => {
  const reading = text => reader(nodeset({ query: text }), { next, took, run: x => query(tree, root, x) })
  t.alike(paths(await reading('swarms/*').all()), ['/swarms/swarm-1', '/swarms/swarm-2'], 'all()')
  const one = []
  for await (const node of reading('swarms/*')) { one.push(node.path); break }
  t.alike(one, ['/swarms/swarm-1'], 'iterated: a reader that stops early')
  const every = []
  for await (const node of reading('*')) every.push(node.path)
  t.alike(every, ['/swarms', '/notes'])
  t.alike(await reading('nothing/*').all(), [], 'nothing there: empty, done')
})

test('XPathResult and XPathIterator: a result says what was asked and its translation; its iterator gives the next node, slices fetched behind the scenes', async (t) => {
  // a topic stored a record a file by its offset, in folders by its digits
  const record = offset => ({ topic: '/request/done', offset, value: { n: offset % 10 } })
  const offsets = [1795312345678, 1795399999999, 1795400000000, 1795400000001, 1795400000002]
  const done = {}
  for (const o of offsets) { const n = String(o); ((done[n.slice(0, 5)] ??= {})[n.slice(0, 6)] ??= {})[`${n}.json`] = record(o) }
  const isFile = node => node && typeof node === 'object' && 'offset' in node
  const stored = { children: node => (node && typeof node === 'object' && !isFile(node) ? Object.entries(node).sort(([a], [b]) => (a < b ? -1 : 1)) : null), document: node => (isFile(node) ? node : null) }
  const ran = []
  const result = new XPathResult({ query: 'done/*', mode: 'logical', layer: 'request' }, {
    physical: { type: 'offset-files', topic: 'done', levels: [5, 6], batch: 2 },
    fixed: offsets.at(-1),
    next, took, address: addressOf,
    run: text => { ran.push(text); return query(stored, { done }, text) }
  })
  t.alike([result.metadata, ran], [{ logical: { query: 'done/*', mode: 'logical', layer: 'request' }, physical: { type: 'offset-files', topic: 'done', levels: [5, 6], batch: 2 }, fixed: offsets.at(-1), reached: null, done: false, last: null }, []], 'made: its metadata, the logical query and its storage; nothing loaded, nothing run')
  t.absent('more' in result || 'nodeset' in result || 'iterateNext' in result, 'how it gets more is its own: nothing of it to call')
  const iterator = result.iterator()
  const first = await iterator.iterateNext()
  t.alike([first.path, first.stored], ['/done/*[@offset=1795400000002]', '/done/17954/179540/1795400000002.json'], 'the next node: at its logical address; where it is stored beside it')
  t.is(ran.length, 1, 'one slice fetched for it')
  t.is((await iterator.iterateNext()).path, '/done/*[@offset=1795400000001]', 'the next: from the slice in hand')
  t.is(ran.length, 1, 'nothing fetched')
  t.is((await iterator.iterateNext()).path, '/done/*[@offset=1795400000000]', 'past the slice: the next one fetched under the hood, the reader sees no boundary')
  t.ok(ran.length > 1)
  t.is(result.metadata.last, ran.at(-1), 'its translation in its metadata: the physical query it is at')
  t.alike((await iterator.take(5)).map(n => n.path), ['/done/*[@offset=1795399999999]', '/done/*[@offset=1795312345678]'], 'take(n): the next n, fewer at the end; how many a reader takes is its own')
  t.alike([await iterator.iterateNext(), result.metadata.done], [null, true], 'at the end: null')
  t.is((await result.iterator().iterateNext()).path, '/done/*[@offset=1795400000002]', 'another iterator: from its start, what the result holds read again, nothing fetched twice')
  // a reader that takes what it wants and stops: only the slices that took
  const few = []
  const partly = new XPathResult({ query: 'done/*', mode: 'logical' }, { physical: { type: 'offset-files', topic: 'done', batch: 2 }, fixed: offsets.at(-1), next, took, address: addressOf, run: text => { few.push(text); return query(stored, { done }, text) } })
  t.alike((await partly.iterator().take(2)).length, 2)
  t.is(few.length, 1, 'two taken of five: one slice fetched, the rest of the topic not touched')
  t.is(partly.metadata.done, false, 'its metadata says there is more')
  // a plain tree: logical and stored the same
  const plain = new XPathResult({ query: 'swarms/*' }, { next, took, address: addressOf, run: text => query(tree, root, text) })
  const seen = []
  for await (const node of plain) seen.push([node.path, node.stored])
  t.alike(seen, [['/swarms/swarm-1', '/swarms/swarm-1'], ['/swarms/swarm-2', '/swarms/swarm-2']], 'iterated; a plain tree: its address where it is stored')
})
