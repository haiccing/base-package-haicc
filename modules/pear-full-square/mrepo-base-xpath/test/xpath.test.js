// A URI resolved on a context written here: its files by path, read as a
// repository's tree would be.
import test from 'brittle'
import { query as result, NODE, shortcutOf, shortcutsAt, linkOf, linked, linkPath, swarmOf, namespaceOf, uriOf, IDENTITY, SHORTCUTS, LINKS, MAIN } from '../index.js'

// (an execution context standing in: the tree, a node its path here; a
// file that may not be there; the log, kept; a step run as it is)
function context (files, dir = '/work/mrepos/boot') {
  const kind = p => (p in files ? 'blob' : Object.keys(files).some(f => f.startsWith(p + '/')) ? 'tree' : null)
  const asked = { children: 0, bytes: [] }
  const exec = {
    runtime: { dir },
    asked,
    // (a layer's root: its branches, as a running mrepo gives it; below it trees)
    node: async u => (kind(u) ? { type: kind(u) === 'tree' && !u.includes('/') ? 'branches' : kind(u), p: u } : null),
    children: async n => { asked.children++; return n.type === 'blob' ? null : [...new Set(Object.keys(files).filter(f => f.startsWith(n.p + '/')).map(f => f.slice(n.p.length + 1).split('/')[0]))].sort().map(name => [name, { type: kind(`${n.p}/${name}`), p: `${n.p}/${name}` }]) },
    bytes: async n => { asked.bytes.push(n.p); return Buffer.from(typeof files[n.p] === 'string' ? files[n.p] : JSON.stringify(files[n.p])) },
    find: async p => (p in files ? Buffer.from(JSON.stringify(files[p])) : null),
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r }
  }
  return exec
}
// a query's result read to its end: what it selects, where it stopped, its metadata
const query = async (exec, uri, opts) => { const r = await result(exec, uri, opts); const found = await r.all(); const nodeset = r.metadata(); return { layer: r.layer, found, stopped: r.stopped(), ...(nodeset ? { nodeset } : {}) } }
const files = () => ({
  'main/.layer.json': {},
  'main/.node.json': { name: 'boot' },
  'main/swarms/.node.json': {},
  'main/swarms/swarm-1/.node.json': { name: 'sam', size: 3, state: 'started', owner: { name: 'ann', publicKey: 'k1' } },
  'main/swarms/swarm-1/nodes/.node.json': {},
  'main/swarms/swarm-1/nodes/node-1/.node.json': { state: 'started' },
  'main/swarms/swarm-2/.node.json': { name: 'tom', size: 1, state: 'stopped' },
  'main/swarms/notes/readme': 'a text',
  'main/host/.node.json': {},
  'main/host/.shortcuts.json': [{ mrepo: 'local/host', link: 'k-host' }, { mrepo: 'swarm-2/node-9' }],
  'links/k-host.json': { key: 'k-host', uri: 'local/host', at: 'host', how: 'deployed', folder: '../local/host', package: 'haiccing/x' },
  'main/records/.node.json': {},
  'main/records/local/.node.json': {},
  'main/records/local/host/.node.json': { key: 'k-host', uri: 'local/host', at: 'host', how: 'deployed', folder: '../local/host', package: 'haiccing/x' },
  'main/empty/.node.json': {},
  'main/empty/.shortcuts.json': [],
  'runtime/service.json': { state: 'started' },
  'request/done/r1.json': { key: 'r1', value: { uri: 'main/host' } }
})
const at = r => r.found.map(f => [f.at, f.kind])
const HOST = { at: 'host', mrepo: 'local/host', link: 'k-host', folder: '../local/host', dir: '/work/mrepos/local/host' }

test('query: what a URI selects, each a reference with what it is', async (t) => {
  const exec = context(files())
  t.alike(at(await query(exec, ['main', '.'])), [['.', 'node']], 'main, the root position: the layer is a node')
  t.alike(at(await query(exec, ['main', 'swarms/swarm-1'])), [['swarms/swarm-1', 'node']], 'a node: a folder holding its document')
  t.alike(at(await query(exec, ['main', 'swarms/*'])), [['swarms/notes', 'folder'], ['swarms/swarm-1', 'node'], ['swarms/swarm-2', 'node']], 'a folder without a document is none; what is hidden is not selected')
  t.alike(at(await query(exec, ['main', '*'])), [['empty', 'node'], ['host', 'node'], ['records', 'node'], ['swarms', 'node']], 'the layer\'s own config, .layer.json at its root, is no child of it: hidden by its name')
  t.alike(at(await query(exec, ['main', 'swarms', 'swarm-1', '.'])), [['swarms/swarm-1', 'node']], 'written at a position: the segments together')
  t.alike(at(await query(exec, ['main', 'nowhere/x'])), [], 'nothing there: nothing')
  t.alike(await query(exec, ['help', 'x']), { layer: 'help', found: [], stopped: [] }, 'no such layer: nothing')
  const r = await query(exec, ['main', 'swarms/swarm-1'])
  t.alike([r.layer, r.found[0].node, r.stopped], ['main', { type: 'tree', p: 'main/swarms/swarm-1' }, []], 'the node as the tree gave it')
  t.alike((await query(exec, ['main', 'swarms/swarm-1/owner/name'])).found, [{ at: 'swarms/swarm-1/owner/name', kind: 'value', value: 'ann' }], 'inside a node\'s document: a value')
  t.alike(at(await query(exec, ['runtime/service.json'])), [['service.json', 'file']], 'the mrepo\'s own: the layer first; a file')
  t.alike((await query(exec, ['request/done/r1.json/value/uri'])).found, [{ at: 'done/r1.json/value/uri', kind: 'value', value: 'main/host' }], 'a file that is a document goes on below it')
  t.alike((await query(exec, ['main', 'swarms/swarm-1/owner/public-key'])).found, [{ at: 'swarms/swarm-1/owner/public-key', kind: 'value', value: 'k1' }], 'a data name in its URI form: publicKey is public-key')
  t.alike(at(await query(exec, ['main', "swarms/*[owner/public-key='k1']"])), [['swarms/swarm-1', 'node']], 'in a filter too')
  await t.exception(query(exec, ['main', "swarms/*[owner/publicKey='k1']"]), /bad filter .*'K': a name in a filter is written as in a URI/, 'as it is stored: no valid URI, refused by the URI\'s own validation')
  t.alike((await query(exec, ['main', 'swarms/*[2]'])).found.map(f => f.at), ['swarms/swarm-1'], 'a position: in the tree\'s order')
  await t.exception(query(exec, ['.']), /not a node: \. \(the mrepo itself; a layer first: main\)/)
  await t.exception(query(exec, ["main[x='1']"]), /not a layer: main\[x='1'\]/)
  await t.exception(query(exec, 'main/host'), /not a URI: its segments, an array/)
  await t.exception(query(exec, ['main', '/host']), /not a relative URI/)
  await t.exception(query(exec, ['main', 'swarms/*[count(*)>1]']), /not a function of this phase: count/, 'what the engine refuses')
})

test('query: filters read the documents', async (t) => {
  const exec = context(files())
  t.alike(at(await query(exec, ['main', "swarms/*[state='started']"])), [['swarms/swarm-1', 'node']])
  t.alike(at(await query(exec, ['main', "swarms/*[size<2 or owner/name='ann']/nodes/*"])), [['swarms/swarm-1/nodes/node-1', 'node']])
  t.alike(at(await query(exec, ['main', "swarms/*[readme='a text']"])), [['swarms/notes', 'folder']], 'a file that is a text: its value')
  t.alike(at(await query(exec, ['main', "[name='boot']/swarms"])), [['swarms', 'node']], 'a filter in front: the layer itself filtered')
  t.alike(at(await query(exec, ["request/done/*[value/uri='main/host']"])), [['done/r1.json', 'file']], 'records: each file its own document')
  t.alike(at(await query(exec, ['request', 'done/*'])), [['done/r1.json', 'file']], 'at another layer: its segments the same way')
  const bad = context({ ...files(), 'main/swarms/swarm-2/.node.json': '{not json' })
  await t.exception(query(bad, ['main', "swarms/*[state='started']"]), /not a document: main\/swarms\/swarm-2\/\.node\.json/)
})

test('query: a shortcut: found as one, and where the URI stops', async (t) => {
  const exec = context(files())
  t.alike((await query(exec, ['main', 'host'])).found, [{ at: 'host', kind: 'node', node: { type: 'tree', p: 'main/host' }, shortcut: HOST }], 'the shortcut itself: its first source, and where it leads on this machine, read from its link\'s record')
  t.alike(await query(exec, ['main', 'host/swarms/*']), { layer: 'main', found: [], stopped: [{ at: 'host', rest: 'swarms/*', shortcut: HOST }], nodeset: { logical: { query: 'host/swarms/*', mode: 'physical', layer: 'main' }, fixed: null, reached: 'end', physical: { type: 'tree' }, done: true, last: 'host/swarms/*' } }, 'a URI through it: stopped there, with what is left; its node set said: what was asked, how it was read')
  t.alike((await query(exec, ['main', "host[state='started']/x"])).stopped.map(s => s.rest), ["[state='started']/x"], 'a filter on it goes with it: its document is elsewhere')
  const all = await query(exec, ['main', '*/*'])
  t.alike([at(all), all.stopped.map(s => [s.at, s.rest])], [[['records/local', 'node'], ['swarms/notes', 'folder'], ['swarms/swarm-1', 'node'], ['swarms/swarm-2', 'node']], [['host', '*']]], 'beside ordinary nodes: both said')
  t.alike((await query(exec, ['main', 'empty'])).found.map(f => f.shortcut), [undefined], 'a list with no source: an ordinary node')
  t.is((await query({ ...exec, runtime: undefined }, ['main', 'host'])).found[0].shortcut.dir, null, 'no folder in the context: none')
  t.alike(await linkOf(exec, 'swarms/x', { mrepo: 'swarm-1/x' }), { at: 'swarms/x', mrepo: 'swarm-1/x', folder: null, dir: null }, 'a shortcut without a link here: where it leads is not known')
  t.alike([(await linked(exec, 'k-host'))?.uri, await linked(exec, 'none'), await linked(exec, undefined)], ['local/host', null, null], 'linked: a link\'s record in the links layer, by its key; none: null')
  t.alike((await query(exec, ['links', "*[uri='local/host']/at"])).found.map(f => f.value), ['host'], 'the links, for the mrepo\'s own lookups: by what a record says, either way')
  t.alike((await query(exec, ['main', "records/local/*[how='deployed']"])).found.map(f => [f.at, f.kind]), [['records/local/host', 'node']], 'nodes by what their documents say, a path deep: queried as any')
  t.alike([await shortcutsAt(exec, 'host'), await shortcutsAt(exec, 'swarms'), (await shortcutsAt(exec, 'empty')).length], [[{ mrepo: 'local/host', link: 'k-host' }, { mrepo: 'swarm-2/node-9' }], [], 0], 'shortcutsAt: the sources recorded at a position, none: []')
})

test('query: measured: its rounds through the context\'s step; a listing asked once', async (t) => {
  const exec = context(files())
  await query(exec, ['main', "swarms/*[state='started']/nodes/*"])
  t.alike(exec.entries.map(e => [e.event, e.in, e.out]), [['query', undefined, undefined], ['segment', 1, 3], ['filter', 3, 1], ['segment', 1, 1], ['batch', undefined, undefined]])
  t.alike(exec.entries.at(-1), { level: 'verbose', event: 'batch', logical: "swarms/*[state='started']/nodes/*", mode: 'physical', type: 'tree', from: null, physical: "swarms/*[state='started']/nodes/*", returned: 1 }, 'the node set\'s batch: the physical query that fetched it, a plain tree\'s the logical one')
  t.alike(exec.entries[0], { level: 'verbose', event: 'query', uri: "main/swarms/*[state='started']/nodes/*", mode: 'physical' }, 'the query, when its result is made: its URI, how it is read; what it fetches follows, as it is read')
  t.alike(exec.asked.bytes.filter(p => p.endsWith(NODE)).sort(), ['main/swarms/swarm-1/.node.json', 'main/swarms/swarm-2/.node.json'], 'the documents of the nodes filtered, each once')
  t.is(MAIN, 'main')
})

test('the paths: a shortcut\'s entry, a link\'s record, the unique URIs', (t) => {
  t.is(shortcutOf('host'), 'main/host/.shortcuts.json', 'in main, beside the node\'s document, hidden')
  t.is(SHORTCUTS, '.shortcuts.json')
  t.is(shortcutOf('swarms/swarm-1/node-1'), 'main/swarms/swarm-1/node-1/.shortcuts.json')
  t.alike([LINKS, linkPath('k-host')], ['links', 'links/k-host.json'], 'a link\'s record: in the links layer, by the link\'s own key')
  t.is(IDENTITY, '/runtime/mrepo.json')
  t.is(swarmOf('local/boot'), 'local')
  t.is(swarmOf('boot'), 'local', 'no swarm: local')
  t.is(uriOf('local/boot', 'host'), 'local/host', 'what the boot mrepo creates: local/<name>')
  t.is(uriOf('swarm-1/node-1', 'x'), 'swarm-1/x')
  t.is(namespaceOf('haiccing/base-package-crud/howto/query/boot'), 'haiccing/base-package-crud/howto/query', 'a namespace a path: all but the name')
  t.is(namespaceOf('boot'), 'local', 'no namespace: local')
  t.is(uriOf('haiccing/base-package-crud/howto/query/boot', 'host'), 'haiccing/base-package-crud/howto/query/host', 'what a how-to\'s boot deploys: beside it, in its namespace')
})

test('query: hidden is the name\'s rule, a name starting with a dot; no name singled out', async (t) => {
  const exec = context({ 'runtime/.layer.json': {}, 'runtime/layer.json': { not: 'a config' }, 'runtime/service.json': { state: 'booted' }, 'runtime/.other.json': {} })
  const found = (await query(exec, ['runtime', '*'])).found.map(f => [f.at, f.kind])
  t.alike(found, [['layer.json', 'file'], ['service.json', 'file']], 'a file named layer.json is data like any other; what starts with a dot is not selected, whatever it is')
})

test('query: a streaming layer read as it is stored: a batch by its folder, its positions and its names; no record opened', async (t) => {
  // request/done as stored: a record a file named by its offset, in folders by its digits
  const record = (offset, protocol) => ({ topic: '/request/done', offset, value: { topic: null, offset, value: { protocol, action: 'x' } } })
  const stored = { 'request/done/.layer.json': { mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6], batch: 50 } } }
  const offsets = [1795312345678, 1795312345679, 1795312399999, 1795399999999, 1795400000000, 1795400000001, 1795400000002, 1795400000003]
  offsets.forEach((o, i) => { stored[`request/done/${String(o).slice(0, 5)}/${String(o).slice(0, 6)}/${o}.json`] = record(o, i % 2 ? 'crud' : 'boot') })
  const names = async uri => { const exec = context(stored); const r = await query(exec, ['request', uri]); return { at: r.found.map(f => f.at.slice(f.at.lastIndexOf('/') + 1)), read: exec.asked.bytes.filter(p => p.endsWith('.json') && !p.endsWith('.layer.json')) } }
  t.alike((await names('done/*/*/*')).at, offsets.map(o => `${o}.json`), 'every record, in the order they arrived: its offsets')
  // the latest folder, the latest of it
  t.alike((await names('done/*[last()]/*[last()]/*')).at, ['1795400000000.json', '1795400000001.json', '1795400000002.json', '1795400000003.json'], 'the latest folder')
  const latest = await names('done/*[last()]/*[last()]/*[position()>last()-2]')
  t.alike(latest.at, ['1795400000002.json', '1795400000003.json'], 'a batch: the latest two of the latest folder')
  t.alike(latest.read, [], 'by positions alone: no record opened')
  // the batch before a point: by name, then by position
  const before = await names("done/17954/179540/*[name()<'1795400000002'][position()>last()-2]")
  t.alike(before.at, ['1795400000000.json', '1795400000001.json'], 'the two before an offset, in one folder: its name compared as text')
  t.alike(before.read, [], 'by names and positions: no record opened')
  t.alike((await names("done/17953/179531/*[name()>'1795312345678.json'][position()<=1]")).at, ['1795312345679.json'], 'the next after an offset: read forward')
  t.alike((await names('done/*[position()<last()]/*/*')).at.length, 4, 'the folders before the latest')
  // one record, by its offset: its place said by its digits
  t.alike((await names('done/17953/179539/1795399999999.json')).at, ['1795399999999.json'], 'one record, by its offset')
  // and by its data, where it has to be opened
  const crud = await names("done/*/*/*[value/value/protocol='crud']")
  t.alike([crud.at.length, crud.read.length], [4, 8], 'by its data: every record opened')
  const bounded = await names("done/*[last()]/*[last()]/*[position()>last()-2][value/value/protocol='crud']")
  t.alike([bounded.at, bounded.read.length], [['1795400000003.json'], 2], 'a batch first, then its data: only the batch opened')
})

test('query: a topic read logically: its records, the latest first, by their addresses; how it is stored hidden, its physical queries in the log', async (t) => {
  const record = (offset, protocol) => ({ topic: '/request/done', offset, value: { topic: null, offset, value: { protocol, action: 'x' } } })
  const stored = { 'request/done/.layer.json': { mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6], batch: 3 } }, 'request/pending/default/.layer.json': { mode: 'non-atomic' }, 'request/pending/default/1795400000009.json': record(1795400000009, 'crud') }
  const offsets = [1795312345678, 1795312345679, 1795312399999, 1795399999999, 1795400000000, 1795400000001, 1795400000002, 1795400000003]
  offsets.forEach((o, i) => { stored[`request/done/${String(o).slice(0, 5)}/${String(o).slice(0, 6)}/${o}.json`] = record(o, i % 2 ? 'crud' : 'boot') })
  const exec = context(stored)
  const all = await query(exec, ['request', 'done/*'], { mode: 'logical' })
  t.alike(all.found.map(f => f.at), [...offsets].reverse().map(o => `done/*[@offset=${o}]`), 'every record, from the latest back, each by its address: no folder of its storage, no file\'s name')
  t.ok(all.found.every(f => f.kind === 'file' && f.node.type === 'blob'), 'each a record: its file behind it')
  t.alike({ ...all.nodeset, last: null }, { logical: { query: 'done/*', mode: 'logical', layer: 'request' }, fixed: 1795400000003, reached: 'end', physical: { levels: [5, 6], batch: 3, type: 'offset-files', topic: 'done', extension: 'json' }, done: true, last: null }, 'its metadata: the request, fixed at the latest offset, its storage')
  t.ok(all.nodeset.last.startsWith('done/'), 'and the last physical query run for it')
  const batches = exec.entries.filter(e => e.event === 'batch')
  t.alike(batches.slice(0, 2).map(e => [e.physical, e.returned, e.fixes ?? false]), [['done/*[last()]/*[last()]/*[last()]', 1, true], ["done/17954/179540/*[name()<='1795400000003.json'][position()>last()-3]", 3, false]], 'its physical queries in the log: what fixed it, then its batches')
  t.ok(batches.every(e => e.logical === 'done/*' && e.mode === 'logical' && e.type === 'offset-files'), 'each with the logical query it stood for')
  t.alike(exec.asked.bytes.filter(p => /\/\d{13}\.json$/.test(p)), [], 'no record opened to list them')
  // what is asked of the records: their data, a path into them, their own offset
  const crud = await query(context(stored), ['request', "done/*[value/value/protocol='crud']"], { mode: 'logical' })
  t.alike(crud.found.map(f => f.at), [1795400000003, 1795400000001, 1795399999999, 1795312345679].map(o => `done/*[@offset=${o}]`), 'by their data')
  const one = await query(context(stored), ['request', 'done/*[@offset=1795399999999]'], { mode: 'logical' })
  t.alike(one.found.map(f => f.at), ['done/*[@offset=1795399999999]'], 'a record by its address, as an answer says it: read back')
  const value = await query(context(stored), ['request', 'done/*[@offset=1795399999999]/value/value/protocol'], { mode: 'logical' })
  t.alike(value.found, [{ at: 'done/*[@offset=1795399999999]/value/value/protocol', kind: 'value', value: 'crud' }], 'a field of it')
  // what is no topic reads the same either way; the physical reading as before
  t.alike((await query(context(stored), ['request', 'pending/default/*'], { mode: 'logical' })).found.map(f => f.at), ['pending/default/1795400000009.json'], 'a plain tree: as it is, logical or not')
  t.alike((await query(context(stored), ['request', 'done/*'])).found.map(f => f.at), ['done/17953', 'done/17954'], 'physically: its folders')
  // an offset as an index: handed to the storage's generator
  const byOffset = context(stored)
  await query(byOffset, ['request', 'done/*[@offset=1795399999999]'], { mode: 'logical' })
  t.alike(byOffset.entries.filter(e => e.event === 'batch').map(e => e.physical), ['done/*[last()]/*[last()]/*[last()]', "done/17953/179539/*[name()='1795399999999.json']"], 'one record by its offset: what fixed the node set, then a scan of its folder; nothing else')
  t.alike((await query(context(stored), ['request', 'done/*[@offset>1795400000000]'], { mode: 'logical' })).found.length, 3, 'after a pointer')
  // a query says where, never how many: the reader of its result takes what it wants
  await t.exception(query(context(stored), ['request', 'done/*[last()]'], { mode: 'logical' }), /a position is no part of a topic's query/)
  t.alike((await (await result(context(stored), ['request', 'done/*'], { mode: 'logical' })).take(2)).map(f => f.at), ['done/*[@offset=1795400000003]', 'done/*[@offset=1795400000002]'], 'the latest two: taken from the result')
  // a topic that is its layer
  const inbox = { 'inbox/.layer.json': { mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6] } }, 'inbox/17954/179540/1795400000000.json': record(1795400000000, 'crud') }
  t.alike((await query(context(inbox), ['inbox', '*'], { mode: 'logical' })).found.map(f => f.at), ['*[@offset=1795400000000]'], 'the layer itself the topic')
  t.alike((await query(context({ 'inbox/.layer.json': { structure: { type: 'offset-files', levels: [5, 6] } } }), ['inbox', '*'], { mode: 'logical' })).found, [], 'nothing in it: nothing')
})

test('result: a URI\'s result as an iterator: the next reference asked for, slices fetched under the hood, a reader takes what it wants', async (t) => {
  const record = offset => ({ topic: '/request/done', offset, value: { topic: null, offset, value: { protocol: 'crud' } } })
  const stored = { 'request/done/.layer.json': { mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6], batch: 2 } } }
  const offsets = [1795312345678, 1795399999999, 1795400000000, 1795400000001, 1795400000002]
  for (const o of offsets) stored[`request/done/${String(o).slice(0, 5)}/${String(o).slice(0, 6)}/${o}.json`] = record(o)
  const exec = context(stored)
  const r = await result(exec, ['request', 'done/*'], { mode: 'logical' })
  const batches = () => exec.entries.filter(e => e.event === 'batch' && !e.fixes).length
  t.alike([r.layer, r.metadata().reached, batches()], ['request', null, 0], 'made: fixed, nothing read, no slice fetched')
  t.alike(await r.iterateNext(), { at: 'done/*[@offset=1795400000002]', kind: 'file', node: { type: 'blob', p: 'request/done/17954/179540/1795400000002.json' } }, 'the next reference: a record at its logical address, its file behind it')
  t.is(batches(), 1, 'one slice fetched')
  t.alike((await r.take(2)).map(f => f.at), ['done/*[@offset=1795400000001]', 'done/*[@offset=1795400000000]'], 'take(2): on, across a slice, under the hood')
  t.is(r.metadata().done, false, 'more there: not read, not fetched')
  t.absent(exec.entries.some(e => e.event === 'batch' && String(e.physical).includes('179531')), 'the oldest folder not touched: two slices fetched, the reader stopped')
  t.alike((await r.all()).map(f => f.at), ['done/*[@offset=1795399999999]', 'done/*[@offset=1795312345678]'], 'all(): what is left')
  t.alike([await r.iterateNext(), r.metadata().done], [null, true], 'at the end: null')
  // ascending: the same topic from its earliest on; from a pointer on
  const up = await result(context(stored), ['request', 'done/*[@offset>1795399999999]'], { mode: 'logical', ascending: true })
  t.alike((await up.all()).map(f => f.at), ['done/*[@offset=1795400000000]', 'done/*[@offset=1795400000001]', 'done/*[@offset=1795400000002]'], 'ascending, after a pointer: what arrived since, in the order it arrived')
  t.is(up.metadata().logical.ascending, true, 'its direction in its metadata')
  // a plain tree, and no such layer: the same object
  const plain = await result(context(files()), ['main', 'swarms/*'])
  t.alike([(await plain.iterateNext()).at, (await plain.all()).length], ['swarms/notes', 2], 'a plain tree: iterated the same way')
  const none = await result(context(files()), ['help', 'x'])
  t.alike([await none.iterateNext(), await none.all(), none.stopped()], [null, [], []], 'no such layer: nothing to iterate')
})
