import test from 'brittle'
import { query } from '../index.js'

// A tree as a repository's: a folder an object, a file a text. A folder's
// document is its `.node.json`; a file's is the file, read as JSON when it
// is that. `.link` makes a folder a link to elsewhere: the query stops.
const doc = v => JSON.stringify(v)
const root = {
  readme: 'hello',
  swarms: {
    'swarm-1': {
      '.node.json': doc({ name: 'sam', size: 3, state: 'started', owner: { name: 'ann', publicKey: 'k1' } }),
      nodes: {
        'node-1': { '.node.json': doc({ state: 'started' }) },
        'node-2': { '.node.json': doc({ state: 'stopped' }) }
      }
    },
    'swarm-2': { '.node.json': doc({ name: 'tom', size: 1, state: 'stopped' }), nodes: {} },
    'swarm-3': { '.node.json': doc({ name: 'sue', size: 12, tags: ['a', 'b'], links: [{ uri: 'x', n: 1 }, { uri: 'y', n: 2 }] }) },
    remote: { '.link': 'elsewhere' }
  },
  requests: {
    r1: doc({ key: 'r1', value: { uri: 'main/host', command: 'crud/read', response: { ok: true } } }),
    r2: doc({ key: 'r2', value: { uri: 'main/swarms', command: 'crud/read', response: { ok: false } } }),
    r3: 'a [note], not json'
  }
}
const isFolder = node => node !== null && typeof node === 'object'
function treeOf (more = {}) {
  const asked = { children: 0, document: [], stop: [] }
  const tree = {
    children: node => { asked.children++; return isFolder(node) ? Object.entries(node).filter(([n]) => !n.startsWith('.')) : null },
    document: node => {
      asked.document.push(node)
      if (isFolder(node)) return '.node.json' in node ? JSON.parse(node['.node.json']) : null
      return node.startsWith('{') ? JSON.parse(node) : node
    },
    stop: ref => { asked.stop.push(ref.path); return ref.node['.link'] },
    ...more
  }
  return { tree, asked }
}
const paths = r => r.found.map(f => f.path)
const run = (text, more) => query(treeOf(more).tree, root, text)

test('query: steps by name, * and .', async (t) => {
  t.alike(paths(await run('swarms/swarm-1')), ['/swarms/swarm-1'])
  t.alike(paths(await run('/swarms/swarm-1/')), ['/swarms/swarm-1'], 'slashes around it')
  t.alike(paths(await run('swarms/*')), ['/swarms/swarm-1', '/swarms/swarm-2', '/swarms/swarm-3', '/swarms/remote'])
  t.alike(paths(await run('swarms/*/nodes/*')), ['/swarms/swarm-1/nodes/node-1', '/swarms/swarm-1/nodes/node-2'])
  t.alike(paths(await run('swarms/./swarm-2/.')), ['/swarms/swarm-2'])
  t.alike(paths(await run('swarms/nope/nodes')), [], 'nothing there: nothing found')
  for (const text of ['', '/', '.']) t.alike(paths(await run(text)), ['/'], `the root: "${text}"`)
})

test('query: what is found is references, nothing of them read', async (t) => {
  const { tree, asked } = treeOf()
  const r = await query(tree, root, 'swarms/swarm-1/nodes/*')
  t.is(r.found[0].node, root.swarms['swarm-1'].nodes['node-1'], 'the node as children gave it')
  t.alike(Object.keys(r.found[0]), ['path', 'node'])
  t.alike(asked.document, [], 'steps that name children: no document read')
  await query(tree, root, 'swarms/*/nodes')
  t.alike(asked.document, [root.swarms['swarm-3']], 'a step that names no child: looked for in the node\'s document')
})

test('query: a document goes on below its node', async (t) => {
  t.alike((await run('swarms/swarm-1/owner/name')).found, [{ path: '/swarms/swarm-1/owner/name', value: 'ann' }])
  t.alike((await run('swarms/swarm-1/owner')).found, [{ path: '/swarms/swarm-1/owner', value: { name: 'ann', publicKey: 'k1' } }])
  t.alike(paths(await run('swarms/swarm-1/owner/*')), ['/swarms/swarm-1/owner/name', '/swarms/swarm-1/owner/publicKey'])
  t.alike((await run('requests/r1/value/uri')).found, [{ path: '/requests/r1/value/uri', value: 'main/host' }], 'a file that is a document')
  t.alike(paths(await run('requests/r1/*')), ['/requests/r1/key', '/requests/r1/value'], '* of a node without children: its document\'s keys')
  t.alike((await run('requests/*/value/response/ok')).found.map(f => f.value), [true, false])
  t.alike((await run('swarms/swarm-3/tags')).found, [{ path: '/swarms/swarm-3/tags[1]', value: 'a' }, { path: '/swarms/swarm-3/tags[2]', value: 'b' }], 'a list is a child that repeats: its key names every item, in order, each path its position')
  t.alike((await run('swarms/swarm-3/links/uri')).found.map(f => [f.path, f.value]), [['/swarms/swarm-3/links[1]/uri', 'x'], ['/swarms/swarm-3/links[2]/uri', 'y']], 'and goes on inside each item')
  t.alike(paths(await run('swarms/swarm-3/*')), ['/swarms/swarm-3/name', '/swarms/swarm-3/size', '/swarms/swarm-3/tags[1]', '/swarms/swarm-3/tags[2]', '/swarms/swarm-3/links[1]', '/swarms/swarm-3/links[2]'], '*: every entry, a list\'s items each')
  t.alike(paths(await run('swarms/swarm-1/*')), ['/swarms/swarm-1/nodes'], 'a child comes before the document')
  t.alike(paths(await run('swarms/swarm-1/owner/name/deeper')), [], 'nothing below a leaf')
  t.alike(paths(await run('requests/r3/anything')), [], 'a text has nothing below')
})

test('query: a filter compares a leaf', async (t) => {
  const swarms = async f => paths(await run(`swarms/*${f}`)).map(p => p.slice('/swarms/'.length))
  t.alike(await swarms("[name='sam']"), ['swarm-1'])
  t.alike(await swarms('[name="sam"]'), ['swarm-1'], 'either quote')
  t.alike(await swarms("[@name='sam']"), ['swarm-1'], '@leaf is leaf')
  t.alike(await swarms("[name!='sam']"), ['swarm-2', 'swarm-3'])
  t.alike(await swarms('[size>2]'), ['swarm-1', 'swarm-3'], 'as numbers: 12 > 2')
  t.alike(await swarms('[size>=3]'), ['swarm-1', 'swarm-3'])
  t.alike(await swarms('[size<3]'), ['swarm-2'])
  t.alike(await swarms('[size<=3]'), ['swarm-1', 'swarm-2'])
  t.alike(await swarms('[size=3]'), ['swarm-1'])
  t.alike(await swarms("[size='3']"), ['swarm-1'], 'a number and a text: as text')
  t.alike(await swarms('[ size = 12 ]'), ['swarm-3'], 'spaces')
  t.alike(await swarms("[name>'sam']"), ['swarm-2', 'swarm-3'], 'two texts: an order as text (tom, sue after sam)')
  t.alike(await swarms("[name<='sam']"), ['swarm-1'])
  t.alike(await swarms("[size>'2']"), ['swarm-1', 'swarm-3'], 'a number on a side: as numbers, whatever the other is written as')
  t.alike(await swarms("[tags='b']"), ['swarm-3'], 'a list: any of its items')
  t.alike(await swarms("[links/uri='y' and links/n=1]"), ['swarm-3'], 'a path through a list: any of them')
})

test('query: a filter asks whether a leaf is there, by a path too', async (t) => {
  t.alike(paths(await run('swarms/*[state]')), ['/swarms/swarm-1', '/swarms/swarm-2'])
  t.alike(paths(await run('swarms/*[owner]')), ['/swarms/swarm-1'], 'what is no leaf is there too')
  t.alike(paths(await run('swarms/*[nodes/node-1]')), ['/swarms/swarm-1'], 'a child, through the tree')
  t.alike(paths(await run("swarms/*[owner/name='ann']")), ['/swarms/swarm-1'])
  t.alike(paths(await run("swarms/*[nodes/*/state='stopped']")), ['/swarms/swarm-1'], 'a side branch, some nodes deep')
  t.alike(paths(await run("requests/*[value/uri='main/host']")), ['/requests/r1'], 'a slash inside a value')
  t.alike(paths(await run("requests/*[.='a [note], not json']")), ['/requests/r3'], 'a file\'s own text; brackets inside a value')
  t.alike(paths(await run("[readme='hello']")), ['/'], 'at the start: the root filtered')
  t.alike(paths(await run("[readme='bye']")), [])
})

test('query: a position: the n-th of the nodes selected under the same parent, from 1; last()', async (t) => {
  t.alike((await run('swarms/swarm-3/tags[2]')).found, [{ path: '/swarms/swarm-3/tags[2]', value: 'b' }], 'in a list: its order')
  t.alike((await run('swarms/swarm-3/tags[last()]')).found.map(f => f.value), ['b'])
  t.alike((await run('swarms/swarm-3/links[2]/uri')).found, [{ path: '/swarms/swarm-3/links[2]/uri', value: 'y' }], 'and on from it; a path found is a query for the same')
  t.alike((await run('swarms/swarm-3/tags[3]')).found, [], 'beyond the last: nothing')
  t.alike(paths(await run('swarms/*[1]')), ['/swarms/swarm-1'], 'in the tree: the order its children come in')
  t.alike(paths(await run('swarms/*[last()]')), ['/swarms/remote'])
  t.alike(paths(await run('swarms/*/nodes/*[1]')), ['/swarms/swarm-1/nodes/node-1'], 'under each parent, not of the whole set')
  t.alike(paths(await run('swarms/*/nodes/*[last()]')), ['/swarms/swarm-1/nodes/node-2'])
  t.alike(paths(await run("swarms/*[state='stopped'][1]")), ['/swarms/swarm-2'], 'after a filter: of what it kept')
  t.alike(paths(await run("swarms/*[2][state='stopped']")), ['/swarms/swarm-2'], 'before one: the second, if it holds')
  t.alike(paths(await run("swarms/*[1][state='stopped']")), [])
  t.alike(paths(await run('swarms/*[4]')), ['/swarms/remote'], 'a link has its place among them: nothing of it read')
  const { tree, asked } = treeOf()
  await query(tree, root, 'swarms/*[2]')
  t.alike(asked.document, [], 'a position reads no document')
  t.alike((await run("swarms/swarm-3/links[uri='y']/n")).found.map(f => f.value), [2], 'a list\'s items filtered as any nodes')
  t.alike((await run("swarms/swarm-3/tags[.='b']")).found.map(f => f.path), ['/swarms/swarm-3/tags[2]'])
  t.alike(paths(await run("swarms/swarm-3/*[name()='tags']")), ['/swarms/swarm-3/tags[1]', '/swarms/swarm-3/tags[2]'], 'name(): the item\'s name, without its position')
})

test('query: and, or, not, several in a row', async (t) => {
  t.alike(paths(await run("swarms/*[size>2 and name='sam']")), ['/swarms/swarm-1'])
  t.alike(paths(await run("swarms/*[name='tom' or name='sue']")), ['/swarms/swarm-2', '/swarms/swarm-3'])
  t.alike(paths(await run("swarms/*[name='tom' or name='sue' and size>2]")), ['/swarms/swarm-2', '/swarms/swarm-3'], 'and before or')
  t.alike(paths(await run("swarms/*[(name='tom' or name='sue') and size>2]")), ['/swarms/swarm-3'])
  t.alike(paths(await run('swarms/*[name][not(state)]')), ['/swarms/swarm-3'])
  t.alike(paths(await run("swarms/*[not(name='sam' or size<2)]")), ['/swarms/swarm-3'])
  t.alike(paths(await run('swarms/*[size>2][state]')), ['/swarms/swarm-1'])
})

test('query: name(), starts-with(), contains()', async (t) => {
  t.alike(paths(await run("swarms/*[name()='swarm-2']")), ['/swarms/swarm-2'])
  t.alike(paths(await run("swarms/*[starts-with(name,'s')]")), ['/swarms/swarm-1', '/swarms/swarm-3'])
  t.alike(paths(await run("swarms/*[contains(name, 'o')]")), ['/swarms/swarm-2'])
  t.alike(paths(await run("swarms/*[starts-with(name(),'swarm') and not(contains(name(),'3'))]")), ['/swarms/swarm-1', '/swarms/swarm-2'])
  t.alike(paths(await run("requests/*[contains(value/uri,'swarms')]")), ['/requests/r2'])
  t.alike(paths(await run("swarms/*[starts-with(nope,'s')]")), [], 'nothing there: the empty text')
  t.alike(paths(await run("swarms/swarm-1/owner/*[name()='publicKey']")), ['/swarms/swarm-1/owner/publicKey'], 'inside a document')
})

test('query: it goes on after a filter', async (t) => {
  t.alike(paths(await run("swarms/*[state='started']/nodes/*[state='stopped']")), ['/swarms/swarm-1/nodes/node-2'])
  t.alike((await run("requests/*/value[command='crud/read']/uri")).found.map(f => f.value), ['main/host', 'main/swarms'], 'a filter inside documents')
  t.alike((await run("requests/*[value/response/ok=true]/key")).found, [], 'true is a name here, not a value')
  t.alike((await run("requests/*[value/response/ok='true']/key")).found, [{ path: '/requests/r1/key', value: 'r1' }])
})

test('query: where it must stop, with what is left', async (t) => {
  const stops = async text => (await run(text)).stopped
  t.alike(await stops("swarms/remote/nodes/*[state='x']"), [{ path: '/swarms/remote', node: root.swarms.remote, rest: "nodes/*[state='x']", why: 'elsewhere' }])
  t.alike(paths(await run("swarms/remote/nodes/*[state='x']")), [])
  const both = await run('swarms/*/nodes/*')
  t.is(both.found.length, 2, 'the others go on here')
  t.alike(both.stopped.map(s => [s.path, s.rest]), [['/swarms/remote', 'nodes/*']])
  const whole = await run('swarms/remote')
  t.alike([paths(whole), whole.stopped], [['/swarms/remote'], []], 'nothing left: it is found')
  t.alike((await stops("swarms/remote[state='started']/nodes")).map(s => s.rest), ["[state='started']/nodes"], 'its document is elsewhere: the filter goes with it')
  const filtered = await run('swarms/*[size>2]')
  t.alike([paths(filtered), filtered.stopped.map(s => s.rest)], [['/swarms/swarm-1', '/swarms/swarm-3'], ['[size>2]']])
  t.alike(await stops('swarms/remote/.'), [], 'the node itself is no going on')
  // what is left is a query, for who goes on: here the same tree, from the node
  const there = await query({ children: treeOf().tree.children, document: () => ({ state: 'started' }) }, root.swarms['swarm-1'], "[state='started']/nodes/*")
  t.alike(paths(there), ['/nodes/node-1', '/nodes/node-2'])
})

test('query: a document read once, a stop asked once', async (t) => {
  const { tree, asked } = treeOf()
  await query(tree, root, "swarms/*[name='sam' or size>2][state]/nodes/*")
  const s = root.swarms
  t.alike(asked.document.filter(isFolder).map(n => Object.keys(s).find(k => s[k] === n)).filter(Boolean), ['swarm-1', 'swarm-2', 'swarm-3'], 'each node\'s document once')
  t.alike(asked.stop.filter(p => p.startsWith('/swarms/')).filter(p => p.split('/').length === 3), ['/swarms/swarm-1', '/swarms/swarm-2', '/swarms/swarm-3', '/swarms/remote'])
})

test('query: each round through step, to be measured', async (t) => {
  const rounds = []
  const step = async (event, data, fn) => { const r = await fn(); rounds.push([event, data(r)]); return r }
  await run('swarms/*[size>2]/nodes/*', { step })
  t.alike(rounds, [
    ['segment', { steps: 'swarms/*', in: 1, out: 4 }],
    ['filter', { filter: '[size>2]', in: 4, out: 2 }],
    ['segment', { steps: 'nodes/*', in: 2, out: 2 }]
  ])
})

test('query: match replaces exact matching of a name', async (t) => {
  t.alike(paths(await run('swarms/SWARM-1')), [])
  t.alike(paths(await run('swarms/SWARM-1', { match: (name, step) => name === step.toLowerCase() })), ['/swarms/swarm-1'])
})

test('query: name gives a document\'s key its name in a query and in a path', async (t) => {
  const name = key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
  t.alike((await run('swarms/swarm-1/owner/public-key', { name })).found, [{ path: '/swarms/swarm-1/owner/public-key', value: 'k1' }], 'a step')
  t.alike(paths(await run("swarms/*[owner/public-key='k1']", { name })), ['/swarms/swarm-1'], 'a leaf in a filter')
  t.alike(paths(await run('swarms/swarm-1/owner/*', { name })), ['/swarms/swarm-1/owner/name', '/swarms/swarm-1/owner/public-key'], '*: each by its name')
  t.alike(paths(await run("swarms/swarm-1/owner/*[name()='public-key']", { name })), ['/swarms/swarm-1/owner/public-key'], 'name() says it')
  t.alike(paths(await run("swarms/*[owner/publicKey='k1']", { name })), [], 'the key as stored is not its name then')
  t.alike((await run('swarms/swarm-1/owner/publicKey')).found.map(f => f.value), ['k1'], 'without it: the key itself')
})

test('query: async children and documents', async (t) => {
  const { tree } = treeOf()
  const slow = { children: async n => tree.children(n), document: async n => tree.document(n), stop: async r => tree.stop(r) }
  const r = await query(slow, root, "swarms/*[state='started']/nodes/*")
  t.alike([paths(r), r.stopped.map(s => s.rest)], [['/swarms/swarm-1/nodes/node-1', '/swarms/swarm-1/nodes/node-2'], ["[state='started']/nodes/*"]])
})

test('query: without document and stop, a tree of names only', async (t) => {
  const plain = { children: n => (isFolder(n) ? Object.entries(n) : null) }
  t.alike(paths(await query(plain, { a: { b: 1, c: 2 } }, "a/*[name()='c']")), ['/a/c'])
  t.alike(paths(await query(plain, { a: { b: 1, c: 2 } }, 'a/*[b]')), [])
  t.alike(paths(await query(plain, { a: { b: 1, c: 2 } }, 'a[b]')), ['/a'])
})

test('query: position() and last() compared, numbers added and taken off: a range of the nodes selected under a parent; nothing read', async (t) => {
  const paths0 = paths(await run('swarms/*'))
  t.alike(paths(await run('swarms/*[position()<=2]')), paths(await run('swarms/*')).slice(0, 2), 'the first two')
  t.alike(paths(await run('swarms/*[position()>last()-2]')), paths(await run('swarms/*')).slice(-2), 'the last two')
  t.alike(paths(await run('swarms/*[position()>1][position()<=1]')), paths(await run('swarms/*')).slice(1, 2), 'a filter after a filter counts again: the next one')
  t.alike(paths(await run('swarms/*[position()=last()]')), paths(await run('swarms/*[last()]')), 'position()=last() is [last()]')
  t.alike(paths(await run('swarms/*[position() > last() - 1 + 0]')), paths(await run('swarms/*[last()]')), 'spaces; plus and minus')
  t.alike(paths(await run('swarms/*/nodes/*[position()<=1]')), paths(await run('swarms/*/nodes/*[1]')), 'under each parent its own count')
  t.alike(paths(await run("swarms/*[position()<=2 and starts-with(name(),'swarm')]")).every(p => p.startsWith('/swarms/swarm')), true, 'joined with a name')
  const { tree, asked } = treeOf()
  await query(tree, root, "swarms/*[position()>last()-2 and starts-with(name(),'r')]")
  t.alike([asked.document, asked.stop], [[], ['/', '/swarms']], 'places and names alone: no document read, none of the nodes filtered asked whether it is a link')
  t.alike(paths(await run("swarms/*[name()<'swarm-2']")), ['/swarms/remote', '/swarms/swarm-1'].sort((x, y) => paths0.indexOf(x) - paths0.indexOf(y)), 'name() in an order: as text')
})

test('query: what is not a query, and what is not of this phase', async (t) => {
  const refused = async (text, what) => t.exception(run(text), what, text)
  await refused("swarms/*[name='sam'", /a filter not closed/)
  await refused("swarms/*[name='sam]", /a quote not closed/)
  await refused('swarms/*[name=]', /something expected/)
  await refused("swarms/*[name='sam' size]", /not understood/)
  await refused('swarms/*[]', /something expected/)
  await refused("swarms/*[name='sam']nodes", /a step after a filter starts with \//)
  await refused('swarms/a b', /not a step: a b/)
  await refused('swarms/@name', /not a step: @name/)
  await refused('swarms//node-1', /descendants \(\/\/\): not in this phase/)
  await refused('swarms/* | requests/*', /the union \(\|\): not in this phase/)
  await refused('child::swarms', /an axis written out \(::\): not in this phase/)
  await refused('swarms/../requests', /the parent \(\.\.\): a query looks forward only/)
  await refused('swarms/*[1 and name]', /a position stands alone in its filter/)
  await refused('swarms/*[0]', /a position stands alone in its filter/)
  await refused('swarms/*[count(nodes)<3]', /not a function of this phase: count/)
  await refused('swarms[count(*)>2]', /not a function of this phase: count/)
  await refused("swarms/*[nodes/*[state='started']]", /a filter inside a filter: not in this phase/)
  await refused("swarms/*[starts-with(name)]", /starts-with\(\) takes 2 arguments/)
  await refused("swarms/*[name('x')='y']", /name\(\) takes 0 arguments/)
  await t.exception(query(treeOf().tree, root, null), /not a query: its text/)
  try { await run("swarms/*[name='sam' size]") } catch (e) { t.is(e.message, "not a query: not understood (swarms/*[name='sam' >>>size])", 'it says where') }
})
