// The crud actions on an execution written here: its files by path, read
// and selected as a repository would, its writes applied at once.
import test from 'brittle'
import { mkdtempSync, rmSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { registry, schemasOf } from 'mycelium-value-avro'
import { record, complete, encodeRecord } from 'mrepo-base-request'
import { create, read, remove, place, NODE } from '../index.js'

const B = v => Buffer.from(JSON.stringify(v))
const J = b => JSON.parse(b.toString())
// (paths are given relative or slash-led: kept slash-led here)
const abs = p => (p.startsWith('/') ? p : `/${p}`)
function execution (files = {}) {
  const writes = []
  const kind = p => (p in files ? 'blob' : Object.keys(files).some(f => f.startsWith(p + '/')) ? 'tree' : null)
  const exec = {
    read: async path => { if (!(abs(path) in files)) throw new Error('none'); return files[abs(path)] },
    // the rest of an execution context, standing in: a file that may not
    // be there, the log (kept: entries), a step run as it is
    find: async function (p) { try { return await this.read(p) } catch { return null } },
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r },
    // an exact path, or the entries of a folder (<folder>/*): files, and
    // the folders that hold some
    select: async pattern => {
      const p = abs(pattern)
      if (!p.endsWith('/*')) return p in files ? [[p, { type: 'blob' }]] : Object.keys(files).some(f => f.startsWith(p + '/')) ? [[p, { type: 'tree' }]] : []
      const folder = p.slice(0, -1)
      const seen = new Map()
      for (const f of Object.keys(files).filter(f => f.startsWith(folder))) {
        const [name, ...rest] = f.slice(folder.length).split('/')
        if (!seen.has(name)) seen.set(name, [folder + name, { type: rest.length ? 'tree' : 'blob' }])
      }
      return [...seen.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    },
    // the tree itself, for a query: a node its path here
    node: async u => (kind(abs(u)) ? { type: kind(abs(u)), p: abs(u) } : null),
    children: async n => (n.type === 'blob' ? null : [...new Set(Object.keys(files).filter(f => f.startsWith(n.p + '/')).map(f => f.slice(n.p.length + 1).split('/')[0]))].sort().map(name => [name, { type: kind(`${n.p}/${name}`), p: `${n.p}/${name}` }])),
    bytes: async n => files[n.p],
    put: (path, bytes) => { files[abs(path)] = Buffer.from(bytes); writes.push(['put', abs(path)]) },
    remove: path => { delete files[abs(path)]; writes.push(['remove', abs(path)]) },
    commit: async () => {}
  }
  return { exec, files, writes }
}
// A request's URI as the mrepo holds it: from outside the prefix main and
// what was written; the mrepo's own, one segment.
const out = u => ['main', u]
const own = u => [u]

test('where a URI points: its layer, its names, the URI of a node in the same format', (t) => {
  const p = place(out('swarms/swarm-1'))
  t.alike([p.layer, p.names], ['main', ['swarms', 'swarm-1']], 'from outside: main, the names as written')
  t.alike([p.uriOf(['swarms', 'swarm-1']), p.uriOf(['swarms']), p.uriOf([])], [['main', 'swarms/swarm-1'], ['main', 'swarms'], ['main', '.']], 'a node\'s URI: the prefix kept, then its own; the layer itself .')
  const q = place(own('runtime/log/levels'))
  t.alike([q.layer, q.names, q.uriOf(['log'])], ['runtime', ['log', 'levels'], ['runtime/log']], 'the mrepo\'s own: the layer first, in the one segment')
  t.alike([place(out('.')).names, place(out('swarms/*')).names, place(out('*/a')).names, place(out("swarms[size>2]")).names], [[], null, null, null], 'the layer itself; a * or a filter: a selection, no one node named')
  t.alike(place(out("swarms/*[owner/name='ann']")).uriOf(['swarms', 'swarm-1']), ['main', 'swarms/swarm-1'], 'a node selected: its URI the same way')
  t.alike(place(['main', 'swarms/swarm-1', '.']).uriOf(['swarms', 'swarm-1', 'nodes']), ['main', 'swarms/swarm-1', 'nodes'], 'written at a position: the prefix kept, the rest behind it')
  t.exception(() => place(own('.')), /not a node: \. \(the mrepo itself; a layer first: main\)/)
  t.alike(place(out('a/b.json')).names, ['a', 'b.json'], 'a name with an extension: a file, read as its document (create refuses it)')
  t.exception(() => place('main/swarms'), /not a URI: its segments, an array/)
})

test('create: the node and every node above it, each a folder with its document; idempotent', async (t) => {
  const { exec, files, writes } = execution({ '/main/.layer.json': B({}) })
  const made = await create(exec, { uri: out('swarms/swarm-1'), args: ['{"size":3}'] })
  t.alike(made, [
    { uri: ['main', 'swarms'], value: {}, children: ['swarm-1'], outcome: 'created' },
    { uri: ['main', 'swarms/swarm-1'], value: { size: 3 }, children: [], outcome: 'created' }
  ], 'what it answers: each node of the path, its URI in the internal format, its document, its children by name, what happened')
  t.alike(Object.keys(files).sort(), ['/main/.layer.json', `/main/swarms/${NODE}`, `/main/swarms/swarm-1/${NODE}`], 'stored: a folder a node, its document in it under a hidden name')
  t.alike([J(files[`/main/swarms/${NODE}`]), J(files[`/main/swarms/swarm-1/${NODE}`])], [{}, { size: 3 }], 'the parent an empty document, the node the value given')
  const n = writes.length
  const again = await create(exec, { uri: out('swarms/swarm-1'), args: ['{"size":99}'] })
  t.alike(again.map(x => [x.outcome, x.value]), [['there', {}], ['there', { size: 3 }]], 'again, with another value: there already, left as it is')
  t.is(writes.length, n, 'nothing written')
  const more = await create(exec, { uri: out('swarms/swarm-2') })
  t.alike(more.map(x => [x.uri[1], x.outcome, x.children]), [['swarms', 'there', ['swarm-1', 'swarm-2']], ['swarms/swarm-2', 'created', []]], 'a sibling: its parent there, itself created; no value: an empty document')
  t.alike(J(files[`/main/swarms/swarm-2/${NODE}`]), {})
  await t.exception(create(exec, { uri: out('.') }), /missing argument: target/, 'the layer itself is not created')
  await t.exception(create(exec, { uri: out('swarms/*') }), /one node, not a selection/)
  await t.exception(create(exec, { uri: out("swarms[size>2]/x") }), /one node, not a selection \(a \* or a filter\)/)
  await t.exception(create(exec, { uri: out('a'), args: ['{not json'] }), /not a document: \{not json \(JSON\)/)
  await t.exception(create(exec, { uri: out('a/b.json') }), /not a name for a node/)
  t.is(writes.length, n + 1, 'a refusal writes nothing')
})

test('read: the nodes a URI selects, an array; none there: empty, not an error', async (t) => {
  const { exec } = execution({ '/main/.layer.json': B({}), [`/main/swarms/${NODE}`]: B({ kind: 'group' }), [`/main/swarms/swarm-1/${NODE}`]: B({}), [`/main/swarms/swarm-2/${NODE}`]: B({ size: 2 }), '/main/swarms/swarm-2/.other.json': B({}), '/main/loose/file.json': B({}) })
  t.alike(await read(exec, { uri: out('swarms') }), [{ uri: ['main', 'swarms'], value: { kind: 'group' }, children: ['swarm-1', 'swarm-2'] }], 'one node: an array of one, its children by name only')
  t.alike(await read(exec, { uri: out('swarms/*') }), [{ uri: ['main', 'swarms/swarm-1'], value: {}, children: [] }, { uri: ['main', 'swarms/swarm-2'], value: { size: 2 }, children: [] }], 'a last name part of *: its children, each a node; a hidden file is not a child')
  t.alike(await read(exec, { uri: out('.') }), [{ uri: ['main', '.'], value: {}, children: ['swarms'] }], 'the layer itself: a node, its document {} when it has none; a folder without a document is no node, so no child')
  t.alike((await read(exec, { uri: out('*') })).map(n => n.uri), [['main', 'swarms']], 'its children, read')
  t.alike(await read(exec, { uri: out('swarmz') }), [], 'nothing there (a typo): an empty array, not an error')
  t.alike(await read(exec, { uri: out('swarms/swarm-1/*') }), [], 'no children: empty')
  t.alike(await read(exec, { uri: own('main/swarms/swarm-2') }), [{ uri: ['main/swarms/swarm-2'], value: { size: 2 }, children: [] }], 'the mrepo\'s own: the layer first, the URI answered in the same format')
})

test('read: a query: a * anywhere, filters on the nodes\' documents, a value inside one', async (t) => {
  const { exec } = execution({ '/main/.layer.json': B({}), [`/main/swarms/${NODE}`]: B({}), [`/main/swarms/swarm-1/${NODE}`]: B({ name: 'sam', size: 3, owner: { name: 'ann' } }), [`/main/swarms/swarm-1/nodes/${NODE}`]: B({}), [`/main/swarms/swarm-1/nodes/node-1/${NODE}`]: B({ state: 'started' }), [`/main/swarms/swarm-2/${NODE}`]: B({ name: 'tom', size: 1 }), [`/main/swarms/swarm-2/nodes/${NODE}`]: B({}), [`/main/swarms/swarm-2/nodes/node-1/${NODE}`]: B({ state: 'stopped' }) })
  const uris = async u => (await read(exec, { uri: out(u) })).map(n => n.uri[1])
  t.alike(await uris("swarms/*[name='sam']"), ['swarms/swarm-1'], 'a filter on a leaf of the document')
  t.alike(await uris('swarms/*[size>=1][owner]'), ['swarms/swarm-1'], 'several in a row')
  t.alike(await uris("swarms/*[starts-with(name,'t') or owner/name='ann']"), ['swarms/swarm-1', 'swarms/swarm-2'])
  t.alike(await uris('swarms/*/nodes/*'), ['swarms/swarm-1/nodes/node-1', 'swarms/swarm-2/nodes/node-1'], 'a * in the middle')
  t.alike(await uris("swarms/*[nodes/*/state='stopped']/nodes"), ['swarms/swarm-2/nodes'], 'a filter by a path, then on')
  t.alike(await read(exec, { uri: out("swarms/*[name='sam']") }), [{ uri: ['main', 'swarms/swarm-1'], value: { name: 'sam', size: 3, owner: { name: 'ann' } }, children: ['nodes'] }], 'each a node, as a plain read gives it')
  t.alike(await read(exec, { uri: out('swarms/swarm-1/owner/name') }), [{ uri: ['main', 'swarms/swarm-1/owner/name'], value: 'ann' }], 'inside a document: the value there')
  t.alike(await uris("swarms/*[name='nobody']"), [], 'nothing selected: empty')
  t.alike(exec.entries.filter(e => e.level === 'verbose').map(e => e.event).slice(0, 4), ['query', 'segment', 'filter', 'batch'], 'measured: the query, its rounds, the batch its result was read with, steps of the action')
  t.alike(await uris('swarms/*[2]'), ['swarms/swarm-2'], 'a position, from 1')
  await t.exception(read(exec, { uri: out('swarms/*[count(*)>1]') }), /not a function of this phase: count/)
  await t.exception(read(exec, { uri: out("swarms/*[ownerName='ann']") }), /bad filter/, 'a name in a filter by the URI\'s rules')
  await t.exception(read(exec, { uri: out('swarms//node-1') }), /not canonical/)
})

test('read: a topic read logically (--flags logical): its records, the latest first, by their addresses; as stored without the flag', async (t) => {
  const record = (offset, protocol) => ({ topic: '/request/done', offset, value: { topic: null, offset, value: { protocol } } })
  const { exec } = execution({
    '/request/done/.layer.json': B({ mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6], batch: 50 } }),
    '/request/done/17953/179539/1795399999999.json': B(record(1795399999999, 'boot')),
    '/request/done/17954/179540/1795400000000.json': B(record(1795400000000, 'crud')),
    '/request/done/17954/179540/1795400000001.json': B(record(1795400000001, 'boot'))
  })
  const at = u => ['request', u]
  const logical = { logical: true }
  const all = await read(exec, { uri: at('done/*'), flags: logical })
  t.alike(all.map(n => n.uri), [1795400000001, 1795400000000, 1795399999999].map(o => ['request', `done/*[@offset=${o}]`]), 'every record, the latest first, each under its address: nothing of its storage in it')
  t.alike(all[0].value, record(1795400000001, 'boot'), 'its value the record')
  t.alike((await read(exec, { uri: at("done/*[value/value/protocol='boot']"), flags: logical })).map(n => n.value.offset), [1795400000001, 1795399999999], 'by its data')
  t.alike(await read(exec, { uri: all[1].uri, flags: logical }), [all[1]], 'an address an answer gave: read back, the same record')
  t.alike((await read(exec, { uri: at('done/*[@offset=1795400000000]/value/value/protocol'), flags: logical })).map(n => [n.uri[1], n.value]), [['done/*[@offset=1795400000000]/value/value/protocol', 'crud']], 'a field of one')
  t.alike((await read(exec, { uri: at('done/*/*/*') })).map(n => n.uri[1]), ['done/17953/179539/1795399999999.json', 'done/17954/179540/1795400000000.json', 'done/17954/179540/1795400000001.json'], 'without the flag: as it is stored')
  t.alike((await read(exec, { uri: at('done/*/*/*'), flags: { physical: true } })).length, 3, 'physical said: the same')
  // the mrepo's setting: its reading where a command says nothing
  const set = execution({
    '/runtime/xpath.json': B({ reading: 'logical' }),
    '/request/done/.layer.json': B({ mode: 'non-atomic', structure: { type: 'offset-files', levels: [5, 6], batch: 50 } }),
    '/request/done/17954/179540/1795400000000.json': B(record(1795400000000, 'crud'))
  }).exec
  t.alike((await read(set, { uri: at('done/*') })).map(n => n.uri[1]), ['done/*[@offset=1795400000000]'], 'the mrepo\'s setting logical: a topic read as its records with no flag')
  t.alike((await read(set, { uri: at('done/*/*/*'), flags: { physical: true } })).map(n => n.uri[1]), ['done/17954/179540/1795400000000.json'], 'a command\'s own flag says for it: physical')
})

test('read: a file is its own document: the records of another layer', async (t) => {
  const { exec } = execution({ '/request/done/.layer.json': B({ kind: 'topic' }), '/request/done/r1.json': B({ key: 'r1', value: { protocol: 'crud', uri: ['main', 'host'] } }), '/request/done/r2.json': B({ key: 'r2', value: { protocol: 'boot', uri: ['main', '.'] } }), '/request/done/note': Buffer.from('a text') })
  const at = u => ['request', u]
  t.alike(await read(exec, { uri: at('done/r1.json') }), [{ uri: ['request', 'done/r1.json'], value: { key: 'r1', value: { protocol: 'crud', uri: ['main', 'host'] } } }], 'a file named: its document, its URI in the request\'s format')
  t.alike((await read(exec, { uri: at("done/*[value/protocol='crud']") })).map(n => n.uri[1]), ['done/r1.json'], 'a filter on the records\' documents')
  t.alike((await read(exec, { uri: at('done/*/value/uri[2]') })).map(n => [n.uri[1], n.value]), [['done/r1.json/value/uri[2]', 'host'], ['done/r2.json/value/uri[2]', '.']], 'a value inside each: a list\'s item by its position')
  t.alike((await read(exec, { uri: at("done/*[value/uri='host']") })).map(n => n.uri[1]), ['done/r1.json'], 'a list in a filter: any of its items')
  t.alike((await read(exec, { uri: at('done/note') }))[0].value, 'a text', 'not JSON: its text')
  await t.exception(remove(exec, { uri: at('done/r1.json') }), /not a node: done\/r1\.json \(a file; crud\/delete removes nodes\)/, 'delete removes nodes, not files')
})

test('read: a binary record (AVRO) is decoded, every level, by the install\'s registry', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'crud-store-'))
  try {
    const reg = registry(schemasOf(store))
    const done = complete(record('/local/host/outbox', { protocol: 'crud', action: 'read', uri: ['main', 'swarms'], args: [] }, 1795312345678), { ok: true, value: [{ uri: ['main', 'swarms'], children: ['swarm-1'] }] })
    const { exec } = execution({ '/packages/manifest.json': B({ store }), '/request/done/r3.avro': encodeRecord(reg, done) })
    const [node] = await read(exec, { uri: ['request', 'done/r3.avro'] })
    t.alike([node.value.value.protocol, node.value.value.action, node.value.value.uri], ['crud', 'read', ['main', 'swarms']], 'its form, the level below the record, as written')
    t.alike(node.value.value.output, done.value.output, 'its output, the level below that, decoded in its place')
    t.alike([node.value.offset, node.value.timestamp], [done.offset, done.timestamp], 'the record around it')
    const unknown = execution({ '/packages/manifest.json': B({ store: join(store, 'none') }), '/request/done/r3.avro': encodeRecord(reg, done) })
    await t.exception(read(unknown.exec, { uri: ['request', 'done/r3.avro'] }), /unknown schema/, 'a fingerprint the registry does not know: an error')
  } finally { rmSync(store, { recursive: true, force: true }) }
})

test('delete: the nodes selected made sure to be gone; children only with recurse; idempotent', async (t) => {
  const start = () => execution({ '/main/.layer.json': B({}), [`/main/swarms/${NODE}`]: B({}), [`/main/swarms/swarm-1/${NODE}`]: B({}), [`/main/swarms/swarm-1/node-1/${NODE}`]: B({}), [`/main/swarms/swarm-2/${NODE}`]: B({ size: 2 }), [`/main/other/${NODE}`]: B({}) })
  let { exec, files, writes } = start()
  t.alike(await remove(exec, { uri: out('swarms/swarm-2') }), [{ uri: ['main', 'swarms/swarm-2'], value: { size: 2 }, children: [], outcome: 'deleted' }], 'what it answers: the node as it was, deleted')
  t.absent(`/main/swarms/swarm-2/${NODE}` in files, 'its document gone, and with it the folder')
  t.alike(await remove(exec, { uri: out('swarms/swarm-2') }), [], 'again: nothing there, nothing selected, the request succeeds')
  const n = writes.length
  await t.exception(remove(exec, { uri: out('swarms') }), /^Error: swarms has children: not deleted \(crud\/delete swarms recurse\)|swarms has children: not deleted \(crud\/delete swarms recurse\)/, 'a node with children, without recurse: refused, saying how')
  await t.exception(remove(exec, { uri: out('*') }), /swarms has children/, 'a selection with one such node: refused whole')
  t.is(writes.length, n, 'a refusal removes nothing')
  t.alike((await remove(exec, { uri: out('swarms'), args: ['recurse'] })).map(x => [x.uri, x.children, x.outcome]), [[['main', 'swarms'], ['swarm-1'], 'deleted']], 'with recurse: the node answered, as it was')
  t.alike(Object.keys(files).sort(), ['/main/.layer.json', `/main/other/${NODE}`], 'everything below it gone with it; nothing else')
  ;({ exec, files } = start())
  t.alike((await remove(exec, { uri: out('swarms/*'), args: ['recurse'] })).map(x => x.uri[1]), ['swarms/swarm-1', 'swarms/swarm-2'], 'a selection: each node of it')
  t.alike(Object.keys(files).sort(), ['/main/.layer.json', `/main/other/${NODE}`, `/main/swarms/${NODE}`], 'the children gone, the node itself kept')
  await t.exception(remove(exec, { uri: out('.') }), /missing argument: target/, 'the layer itself is not deleted')
  ;({ exec, files } = start())
  t.alike((await remove(exec, { uri: out('swarms/*[size=2]') })).map(x => x.uri[1]), ['swarms/swarm-2'], 'a filter: the nodes it selects')
  t.absent(`/main/swarms/swarm-2/${NODE}` in files)
  ;({ exec, files } = start())
  files[`/main/${NODE}`] = B({ size: 2 })
  const before = Object.keys(files).length
  await t.exception(remove(exec, { uri: out('swarms/swarm-2/size') }), /not a node: swarms\/swarm-2\/size \(a value inside a document; crud\/delete removes nodes\)/)
  await t.exception(remove(exec, { uri: out('[size=2]'), args: ['recurse'] }), /the layer itself/, 'a filter in front selects the layer: not deleted')
  t.is(Object.keys(files).length, before, 'nothing removed')
  await t.exception(remove(exec, { uri: out('other'), args: ['all'] }), /not an argument: all \(recurse\)/)
})

test('a shortcut: a node that is a link, read with where it leads; deleted, the link goes; a URI does not run through it', async (t) => {
  const { exec, files } = execution({ '/main/.layer.json': B({}), [`/main/host/${NODE}`]: B({}), '/main/host/.shortcuts.json': B([{ mrepo: 'local/host' }]) })
  t.alike(await read(exec, { uri: out('host') }), [{ uri: ['main', 'host'], value: {}, children: [], shortcuts: [{ mrepo: 'local/host' }] }], 'read: a node, with its shortcuts: the mrepos its data comes from')
  await t.exception(read(exec, { uri: out('host/swarms') }), /host is a shortcut: a URI does not run through it \(haicc host haicc swarms \.\.\.\)/, 'below it: not read here; the way across said')
  await t.exception(read(exec, { uri: out('host/*') }), /host is a shortcut: a URI does not run through it \(haicc host haicc \* \.\.\.\)/, 'its children neither')
  await t.exception(read(exec, { uri: out("*[state='started']") }), /host is a shortcut: a URI does not run through it \(haicc host haicc \[state='started'\] \.\.\.\)/, 'a filter on it neither: its document is elsewhere')
  await t.exception(create(exec, { uri: out('host/swarms') }), /host is a shortcut/, 'nothing created below it')
  t.alike((await create(exec, { uri: out('host') })).map(x => x.outcome), ['there'], 'itself: there')
  t.alike((await remove(exec, { uri: out('host') })).map(x => [x.shortcuts, x.outcome]), [[[{ mrepo: 'local/host' }], 'deleted']], 'deleted: the node and its link, not what it leads to')
  t.alike(Object.keys(files), ['/main/.layer.json'], 'its document and its shortcuts gone')
})

test('another layer, for the mrepo\'s own requests: the same, the layer first', async (t) => {
  const { exec, files } = execution({ '/runtime/.layer.json': B({}), '/runtime/host/.shortcuts.json': B([{ mrepo: 'x' }]) })
  t.alike((await create(exec, { uri: own('runtime/log/levels'), args: ['{"level":"info"}'] })).map(x => [x.uri, x.outcome]), [[['runtime/log'], 'created'], [['runtime/log/levels'], 'created']])
  t.alike(J(files[`/runtime/log/levels/${NODE}`]), { level: 'info' })
  t.alike((await create(exec, { uri: own('runtime/host/x') })).map(x => x.outcome), ['created', 'created'], 'shortcuts are main\'s: nothing in the way elsewhere')
})

