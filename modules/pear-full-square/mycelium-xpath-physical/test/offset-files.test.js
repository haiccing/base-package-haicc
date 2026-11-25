import test from 'brittle'
import { query, nodeset, reader } from 'mycelium-xpath'
import { next, took } from '../index.js'

// A topic as it is stored: a record a file named by its offset, in folders
// by its digits; the layer's own files beside them, hidden.
const record = (offset, protocol) => ({ topic: '/request/done', offset, value: { topic: null, offset, value: { protocol } } })
const OFFSETS = [1795312345678, 1795312345679, 1795312399999, 1795399999999, 1795400000000, 1795400000001, 1795400000002, 1795400000003, 1795500000000]
function stored (offsets = OFFSETS) {
  const done = {}
  offsets.forEach((o, i) => { const n = String(o); ((done[n.slice(0, 5)] ??= {})[n.slice(0, 6)] ??= {})[`${n}.json`] = record(o, i % 2 ? 'crud' : 'boot') })
  return { done, pending: {} }
}
const isFile = node => node && typeof node === 'object' && 'topic' in node && 'offset' in node
const treeOf = (asked = { documents: 0 }) => ({
  children: node => (node && typeof node === 'object' && !isFile(node) ? Object.entries(node).sort(([a], [b]) => (a < b ? -1 : 1)) : null),
  document: node => { if (isFile(node)) { asked.documents++; return node } return null }
})
const TOPIC = { type: 'offset-files', topic: 'done', levels: [5, 6], batch: 3, extension: 'json' }
function reading (logical, { root = stored(), fixed = OFFSETS.at(-1), physical = TOPIC, ascending = false } = {}) {
  const ran = []
  const asked = { documents: 0 }
  const set = nodeset({ query: logical, mode: 'logical', layer: 'request', ascending }, physical, fixed)
  const read = reader(set, { next, took, run: text => { ran.push(text); return query(treeOf(asked), root, text) } })
  return { set, read, ran, asked }
}
const offsets = nodes => nodes.map(n => Number(n.path.slice(n.path.lastIndexOf('/') + 1, -'.json'.length)))

test('offset-files: the physical queries of a batch: from the fixed offset back, a folder at a time, by name and position; no record opened', async (t) => {
  const { set, read, ran, asked } = reading('done/*')
  t.alike([set.nodes, ran], [[], []], 'made: nothing loaded, nothing run')
  const first = await read.more()
  t.alike(offsets(first), [1795500000000, 1795400000003, 1795400000002], 'the first batch: the latest three, the latest first')
  t.alike(ran, [
    "done/17955/179550/*[name()<='1795500000000.json'][position()>last()-3]",
    "done/17955/*[name()<'179550'][last()]",
    "done/*[name()<'17955'][last()]",
    'done/17954/*[last()]',
    'done/17954/179540/*[position()>last()-2]'
  ], 'its physical queries: the fixed offset\'s folder by its digits; that folder run out, the one before it, a level up where there is none; then the rest of the batch there')
  t.is(asked.documents, 0, 'by names and positions: no record opened')
  ran.length = 0
  t.alike(offsets(await read.more()), [1795400000001, 1795400000000, 1795399999999], 'the next batch: on from where it read to, across a folder')
  t.alike(ran, [
    "done/17954/179540/*[name()<'1795400000002.json'][position()>last()-3]",
    "done/17954/*[name()<'179540'][last()]",
    "done/*[name()<'17954'][last()]",
    'done/17953/*[last()]',
    'done/17953/179539/*[position()>last()-1]'
  ])
  t.alike(offsets(await read.all()), [...OFFSETS].reverse(), 'read to its end: every record, from the latest back')
  t.alike([set.done, set.reached], [true, 'end'])
  t.is(await read.more(), null, 'no more')
})

test('offset-files: fixed at the time of the request: what arrived after is not in it', async (t) => {
  const { read } = reading('done/*', { fixed: 1795400000001 })
  t.alike(offsets(await read.all()), [1795400000001, 1795400000000, 1795399999999, 1795312399999, 1795312345679, 1795312345678], 'from the fixed offset back: the later ones left out')
  const empty = reading('done/*', { root: { done: {} }, fixed: null })
  t.alike([await empty.read.all(), empty.ran], [[], []], 'a topic with nothing in it: nothing to read, nothing run')
})

test('offset-files: what is asked of the records goes with each batch: a filter on their data, a path into them; only the batch opened', async (t) => {
  const { read, ran, asked } = reading("done/*[value/value/protocol='crud']")
  const first = await read.more()
  t.alike(offsets(first), [1795400000003], 'of the latest three, those the filter holds for')
  t.alike(ran.filter(x => x.includes('protocol')), [
    "done/17955/179550/*[name()>='1795500000000.json'][name()<='1795500000000.json'][value/value/protocol='crud']",
    "done/17954/179540/*[name()>='1795400000002.json'][name()<='1795400000003.json'][value/value/protocol='crud']"
  ], 'the batch\'s records, named from first to last, with what is asked of them')
  t.is(asked.documents, 3, 'the batch opened, nothing else')
  t.alike(offsets(await read.all()), [1795400000003, 1795400000001, 1795399999999, 1795312345679], 'to its end')
  const values = reading('done/*/value/value/protocol', { fixed: 1795312345679 })
  t.alike((await values.read.all()).map(n => n.value), ['crud', 'boot'], 'a path into each record: its values, the latest first')
})

test('offset-files: a topic that is its layer; other levels; a batch larger than what is there', async (t) => {
  const inbox = reading('*', { root: stored().done, physical: { type: 'offset-files', topic: '', batch: 50 } })
  t.alike(offsets(await inbox.read.more()), [...OFFSETS].reverse(), 'the layer itself the topic; a batch of 50: all nine, in one')
  t.is(inbox.ran[0], "17955/179550/*[name()<='1795500000000.json'][position()>last()-50]", 'the defaults: two levels, 5 and 6 digits')
  t.is(inbox.set.done, true, 'a batch not filled: read on to the topic\'s start, its end known')
  t.is(await inbox.read.more(), null, 'asked again: no more')
})

test('offset-files: an offset is an index: one record by a scan of its folder; bounds say where the reading starts and stops', async (t) => {
  const one = reading('done/*[@offset=1795399999999]')
  t.alike(offsets(await one.read.all()), [1795399999999], 'one record')
  t.alike(one.ran, ["done/17953/179539/*[name()='1795399999999.json']"], 'its folder said by its digits, that folder scanned for it: no other touched')
  t.is(one.asked.documents, 0, 'not opened to find it')
  t.alike((await reading('done/*[@offset=1795399999999]/value/value/protocol').read.all()).map(n => n.value), ['crud'], 'a field of it')
  t.alike(await reading('done/*[@offset=1795399999998]').read.all(), [], 'no record of that offset: none')
  t.alike(await reading('done/*[@offset=1795500000000]', { fixed: 1795400000003 }).read.all(), [], 'one that arrived after the node set was fixed: not in it')
  t.alike(offsets(await reading('done/*[offset=1795312345678]').read.all()), [1795312345678], 'written without its @: the same')
  // from a point back
  const below = reading('done/*[@offset<1795400000002]')
  t.alike(offsets(await below.read.more()), [1795400000001, 1795400000000, 1795399999999], 'below an offset: the reading starts there')
  t.is(below.ran[0], "done/17954/179540/*[name()<='1795400000001.json'][position()>last()-3]", 'in its folder, nothing later touched')
  // back to a point
  const since = reading('done/*[@offset>1795400000000]')
  t.alike(offsets(await since.read.all()), [1795500000000, 1795400000003, 1795400000002, 1795400000001], 'after a pointer: what arrived since')
  t.absent(since.ran.some(x => x.includes('17953')), 'nothing before the pointer\'s folder touched')
  t.ok(since.ran.some(x => x.includes("[name()>='1795400000001.json']")), 'in the pointer\'s folder the scan stops at it')
  t.alike(offsets(await reading('done/*[@offset>=1795399999999][@offset<1795400000002]').read.all()), [1795400000001, 1795400000000, 1795399999999], 'between two')
  t.alike(await reading('done/*[@offset>1795500000000]').read.all(), [], 'after the latest: none')
})

test('offset-files: what is no topic\'s records, and a position in its query, said', (t) => {
  const set = q => nodeset({ query: q, mode: 'logical' }, TOPIC, 1)
  t.exception(() => next(set('pending/*')), /not a topic's records: pending\/\* \(done\/\*, its filters, a path into a record\)/)
  t.exception(() => next(set('done')), /not a topic's records/)
  for (const q of ['done/*[2]', 'done/*[last()]', 'done/*[position()<=10]', 'done/*[position()>last()-100]', "done/*[value/a='x'][last()]", 'done/*[@offset<5][last()]']) t.exception(() => next(set(q)), /a position is no part of a topic's query: .* who reads the result takes as many as it wants/, q)
  t.execution(() => next(set("done/*[value/note='the last() one']")), 'a text that says last() is no position')
})

test('offset-files: ascending: the same topic from its earliest on, or from a lower bound; up to the fixed offset, no record opened', async (t) => {
  const { set, read, ran, asked } = reading('done/*', { ascending: true, fixed: 1795400000003 })
  t.alike(offsets(await read.more()), [1795312345678, 1795312345679, 1795312399999], 'the first batch: the earliest three, in the order they arrived')
  t.alike(ran, ['done/*[1]', 'done/17953/*[1]', 'done/17953/179531/*[position()<=3]'], 'its physical queries: the topic\'s first folder found from its top, then that folder from its start')
  t.is(asked.documents, 0, 'by names and positions: no record opened')
  t.alike(offsets(await read.all()), OFFSETS.slice(0, 8), 'to its end: every record up to the fixed offset; one that arrived after it is not in it')
  t.alike([set.done, set.reached], [true, 'end'])
  t.ok(ran.some(q => q.includes("[name()<='1795400000003.json']")), 'in the fixed offset\'s folder: the scan stops at it')
  // from a pointer on: what arrived since, the earliest first (an inbox's reading)
  t.alike(offsets(await reading('done/*[@offset>1795399999999]', { ascending: true }).read.all()), [1795400000000, 1795400000001, 1795400000002, 1795400000003, 1795500000000], 'after a pointer: what arrived since, in the order it arrived')
  t.alike(offsets(await reading('done/*[@offset>=1795312345679][@offset<1795400000001]', { ascending: true }).read.all()), [1795312345679, 1795312399999, 1795399999999, 1795400000000], 'between two bounds, ascending')
  t.alike(await reading('done/*[@offset>1795500000000]', { ascending: true }).read.all(), [], 'after the latest: none')
  t.alike(offsets(await reading("done/*[value/value/protocol='crud']", { ascending: true }).read.all()), OFFSETS.filter((o, i) => i % 2), 'a filter on the data, ascending: each batch opened, in order')
  t.alike(await reading('*', { ascending: true, root: {}, fixed: null, physical: { ...TOPIC, topic: '' } }).read.all(), [], 'a topic with nothing in it: nothing')
})
