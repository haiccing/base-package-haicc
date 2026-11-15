// A URI resolved on a context written here: its files by path, read as a
// repository's tree would be.
import test from 'brittle'
import { query, NODE, shortcutOf, shortcutsAt, linkOf, shadowOf, swarmOf, uriOf, IDENTITY, SHORTCUTS, MAIN } from '../index.js'

// (an execution context standing in: the tree, a node its path here; a
// file that may not be there; the log, kept; a step run as it is)
function context (files, dir = '/work/mrepos/boot') {
  const kind = p => (p in files ? 'blob' : Object.keys(files).some(f => f.startsWith(p + '/')) ? 'tree' : null)
  const asked = { children: 0, bytes: [] }
  const exec = {
    runtime: { dir },
    asked,
    node: async u => (kind(u) ? { type: kind(u), p: u } : null),
    children: async n => { asked.children++; return n.type === 'blob' ? null : [...new Set(Object.keys(files).filter(f => f.startsWith(n.p + '/')).map(f => f.slice(n.p.length + 1).split('/')[0]))].sort().map(name => [name, { type: kind(`${n.p}/${name}`), p: `${n.p}/${name}` }]) },
    bytes: async n => { asked.bytes.push(n.p); return Buffer.from(typeof files[n.p] === 'string' ? files[n.p] : JSON.stringify(files[n.p])) },
    find: async p => (p in files ? Buffer.from(JSON.stringify(files[p])) : null),
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r }
  }
  return exec
}
const files = () => ({
  'main/layer.json': {},
  'main/.node.json': { name: 'boot' },
  'main/swarms/.node.json': {},
  'main/swarms/swarm-1/.node.json': { name: 'sam', size: 3, state: 'started', owner: { name: 'ann', publicKey: 'k1' } },
  'main/swarms/swarm-1/nodes/.node.json': {},
  'main/swarms/swarm-1/nodes/node-1/.node.json': { state: 'started' },
  'main/swarms/swarm-2/.node.json': { name: 'tom', size: 1, state: 'stopped' },
  'main/swarms/notes/readme': 'a text',
  'main/host/.node.json': {},
  'main/host/.shortcuts.json': [{ mrepo: 'local/host' }, { mrepo: 'swarm-2/node-9' }],
  'main/empty/.node.json': {},
  'main/empty/.shortcuts.json': [],
  'runtime/service.json': { state: 'started' },
  'request/done/r1.json': { key: 'r1', value: { uri: 'main/host' } }
})
const at = r => r.found.map(f => [f.at, f.kind])
const HOST = { at: 'host', mrepo: 'local/host', folder: 'main/host', dir: '/work/mrepos/boot/main/host' }

test('query: what a URI selects, each a reference with what it is', async (t) => {
  const exec = context(files())
  t.alike(at(await query(exec, ['main', '.'])), [['.', 'node']], 'main, the root position: the layer is a node')
  t.alike(at(await query(exec, ['main', 'swarms/swarm-1'])), [['swarms/swarm-1', 'node']], 'a node: a folder holding its document')
  t.alike(at(await query(exec, ['main', 'swarms/*'])), [['swarms/notes', 'folder'], ['swarms/swarm-1', 'node'], ['swarms/swarm-2', 'node']], 'a folder without a document is none; what is hidden is not selected')
  t.alike(at(await query(exec, ['main', '*'])), [['empty', 'node'], ['host', 'node'], ['layer.json', 'file'], ['swarms', 'node']])
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
  t.alike(at(await query(exec, ['main', "swarms/*[owner/publicKey='k1']"])), [], 'not as it is stored')
  await t.exception(query(exec, ['.']), /not a node: \. \(the mrepo itself; a layer first: main\)/)
  await t.exception(query(exec, ["main[x='1']"]), /not a layer: main\[x='1'\]/)
  await t.exception(query(exec, 'main/host'), /not a URI: its segments, an array/)
  await t.exception(query(exec, ['main', '/host']), /not a relative URI/)
  await t.exception(query(exec, ['main', 'swarms/*[1]']), /a position: not in this phase/, 'what the engine refuses')
})

test('query: filters read the documents', async (t) => {
  const exec = context(files())
  t.alike(at(await query(exec, ['main', "swarms/*[state='started']"])), [['swarms/swarm-1', 'node']])
  t.alike(at(await query(exec, ['main', "swarms/*[size<2 or owner/name='ann']/nodes/*"])), [['swarms/swarm-1/nodes/node-1', 'node']])
  t.alike(at(await query(exec, ['main', "swarms/*[readme='a text']"])), [['swarms/notes', 'folder']], 'a file that is a text: its value')
  t.alike(at(await query(exec, ['main', "[name='boot']/swarms"])), [['swarms', 'node']], 'a filter in front: the layer itself filtered')
  t.alike(at(await query(exec, ["request/done/*[value/uri='main/host']"])), [['done/r1.json', 'file']], 'records: each file its own document')
  const bad = context({ ...files(), 'main/swarms/swarm-2/.node.json': '{not json' })
  await t.exception(query(bad, ['main', "swarms/*[state='started']"]), /not a document: main\/swarms\/swarm-2\/\.node\.json/)
})

test('query: a shortcut: found as one, and where the URI stops', async (t) => {
  const exec = context(files())
  t.alike((await query(exec, ['main', 'host'])).found, [{ at: 'host', kind: 'node', node: { type: 'tree', p: 'main/host' }, shortcut: HOST }], 'the shortcut itself: its first source, the linked mrepo\'s folder in the shadow of main')
  t.alike(await query(exec, ['main', 'host/swarms/*']), { layer: 'main', found: [], stopped: [{ at: 'host', rest: 'swarms/*', shortcut: HOST }] }, 'a URI through it: stopped there, with what is left')
  t.alike((await query(exec, ['main', "host[state='started']/x"])).stopped.map(s => s.rest), ["[state='started']/x"], 'a filter on it goes with it: its document is elsewhere')
  const all = await query(exec, ['main', '*/*'])
  t.alike([at(all), all.stopped.map(s => [s.at, s.rest])], [[['swarms/notes', 'folder'], ['swarms/swarm-1', 'node'], ['swarms/swarm-2', 'node']], [['host', '*']]], 'beside ordinary nodes: both said')
  t.alike((await query(exec, ['main', 'empty'])).found.map(f => f.shortcut), [undefined], 'a list with no source: an ordinary node')
  t.is((await query({ ...exec, runtime: undefined }, ['main', 'host'])).found[0].shortcut.dir, null, 'no folder in the context: none')
  t.alike(linkOf(exec, 'swarms/x', { mrepo: 'swarm-1/x' }), { at: 'swarms/x', mrepo: 'swarm-1/x', folder: 'main/swarms/x', dir: '/work/mrepos/boot/main/swarms/x' })
  t.alike([await shortcutsAt(exec, 'host'), await shortcutsAt(exec, 'swarms'), (await shortcutsAt(exec, 'empty')).length], [[{ mrepo: 'local/host' }, { mrepo: 'swarm-2/node-9' }], [], 0], 'shortcutsAt: the sources recorded at a position, none: []')
})

test('query: measured: its rounds through the context\'s step; a listing asked once', async (t) => {
  const exec = context(files())
  await query(exec, ['main', "swarms/*[state='started']/nodes/*"])
  t.alike(exec.entries.map(e => [e.event, e.in, e.out]), [['segment', 1, 3], ['filter', 3, 1], ['segment', 1, 1], ['query', undefined, undefined]])
  t.alike(exec.entries.at(-1), { level: 'verbose', event: 'query', uri: "main/swarms/*[state='started']/nodes/*", found: 1, stopped: 0 })
  t.alike(exec.asked.bytes.filter(p => p.endsWith(NODE)).sort(), ['main/swarms/swarm-1/.node.json', 'main/swarms/swarm-2/.node.json'], 'the documents of the nodes filtered, each once')
  t.is(MAIN, 'main')
})

test('the paths: a shortcut\'s entry, the shadow folder, the unique URIs', (t) => {
  t.is(shortcutOf('host'), 'main/host/.shortcuts.json', 'in main, beside the node\'s document, hidden')
  t.is(SHORTCUTS, '.shortcuts.json')
  t.is(shortcutOf('swarms/swarm-1/node-1'), 'main/swarms/swarm-1/node-1/.shortcuts.json')
  t.is(shadowOf('host'), 'main/host')
  t.is(shadowOf('.'), 'main')
  t.is(IDENTITY, '/runtime/mrepo.json')
  t.is(swarmOf('local/boot'), 'local')
  t.is(swarmOf('boot'), 'local', 'no swarm: local')
  t.is(uriOf('local/boot', 'host'), 'local/host', 'what the boot mrepo creates: local/<name>')
  t.is(uriOf('swarm-1/node-1', 'x'), 'swarm-1/x')
})
