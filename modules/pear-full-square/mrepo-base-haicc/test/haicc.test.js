// goto on a context written here: its shortcuts by path; what it runs
// and what it sends on, kept.
import test from 'brittle'
import { goto, CONFIG } from '../index.js'

function context (files) {
  const seen = { ran: [], at: [], sent: [] }
  const kind = p => (p in files ? 'blob' : Object.keys(files).some(f => f.startsWith(p + '/')) ? 'tree' : null)
  const exec = {
    runtime: { dir: '/work/mrepos/boot' },
    // an execution context, standing in: the tree (a node its path here),
    // the log (kept: entries), a step run as it is
    node: async u => (kind(u) ? { type: kind(u), p: u } : null),
    children: async n => (n.type === 'blob' ? null : [...new Set(Object.keys(files).filter(f => f.startsWith(n.p + '/')).map(f => f.slice(n.p.length + 1).split('/')[0]))].sort().map(name => [name, { type: kind(`${n.p}/${name}`), p: `${n.p}/${name}` }])),
    bytes: async n => Buffer.from(JSON.stringify(files[n.p])),
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r },
    run: async (command, opts) => { seen.ran.push(command); seen.at.push(opts?.at); return { ran: command } },
    forward: (to, command) => { seen.sent.push({ to, command }); return null }
  }
  return { exec, seen }
}
const FILES = () => ({
  'main/layer.json': {},
  'main/host/.node.json': {},
  'main/host/.shortcuts.json': [{ mrepo: 'local/host' }],
  'main/swarms/.node.json': {},
  'main/swarms/swarm-1/.node.json': { state: 'started', size: 3 },
  'main/swarms/swarm-2/.node.json': { state: 'stopped', size: 1 },
  'main/swarms/swarm-3/.node.json': { state: 'started', size: 9 },
  'main/links/.node.json': {},
  'main/links/far/.node.json': {},
  'main/links/far/.shortcuts.json': [{ mrepo: 'swarm-9/far' }]
})
const HOST = { at: 'host', mrepo: 'local/host', folder: 'main/host', dir: '/work/mrepos/boot/main/host' }

test('goto: at the root executed here; at a shortcut sent on; no command', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', '.'], args: ['boot/deploy', 'host', 'haiccing/base-component-haicc'] }), { ran: ['boot/deploy', 'host', 'haiccing/base-component-haicc'] }, 'main, the root position: the command executed here, its value returned')
  t.alike(seen.at, [['main']], 'the command that follows stands at the position: its URI is read behind that prefix')
  t.alike(await goto(exec, { uri: ['.'], args: ['help/extract'] }), { ran: ['help/extract'] }, 'the mrepo itself (its own command): executed here')
  t.alike(seen.at, [['main'], []], 'standing at the root: no prefix')
  t.is(await goto(exec, { uri: ['main', 'host'], args: ['haicc', 'swarms/swarm-1', 'boot/deploy', 'node-1'] }), null, 'a shortcut: sent on')
  t.alike(seen.sent, [{ to: HOST, command: ['haicc', 'swarms/swarm-1', 'boot/deploy', 'node-1'] }], 'the command that follows, unchanged, to the mrepo linked there')
  t.is(seen.ran.length, 2, 'nothing of it executed here')
  await t.exception(goto(exec, { uri: ['main', 'host'] }), /missing argument: command/)
  await t.exception(goto(exec, { uri: ['main', '/host'], args: ['service/start'] }), /not a relative URI/)
  await t.exception(goto(exec, { uri: ['runtime'], args: ['service/start'] }), /not a position in main: runtime \(main, main\/<position>\)/)
  await t.exception(goto(exec, { uri: ['mainly/x'], args: ['service/start'] }), /not a position in main/)
})

test('goto: a position inside main: the command executed there, the current root moved', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', 'swarms/swarm-1'], args: ['crud/read', '.'] }), { ran: ['crud/read', '.'] }, 'a URI that names one position: what the command gave, as it is')
  t.alike(seen.at, [['main', 'swarms/swarm-1']], 'the command stands at the position')
  t.alike(await goto(exec, { uri: ['main', 'swarms', 'swarm-2'], args: ['crud/read', '.'] }), { ran: ['crud/read', '.'] }, 'a goto at a position: its URI read behind it')
  t.alike(seen.at.at(-1), ['main', 'swarms/swarm-2'])
  await t.exception(goto(exec, { uri: ['main', 'nowhere'], args: ['crud/read', '.'] }), /haicc nowhere: no node there/, 'a position named that is not there: an error')
  await t.exception(goto(exec, { uri: ['main', 'swarms/swarm-1/state'], args: ['crud/read', '.'] }), /haicc swarms\/swarm-1\/state: not a position \(a node; a value inside a document is none\)/)
  await t.exception(goto(exec, { uri: ['main', 'layer.json'], args: ['crud/read', '.'] }), /haicc layer\.json: not a position \(a node; a file is none\)/)
  t.alike(exec.entries.filter(e => e.event === 'executed here').map(e => e.at), ['swarms/swarm-1', 'swarms/swarm-2'])
})

test('goto: a URI that selects: the command executed at each position, a list of what each gave', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', "swarms/*[state='started']"], args: ['service/start'] }), [{ at: 'swarms/swarm-1', value: { ran: ['service/start'] } }, { at: 'swarms/swarm-3', value: { ran: ['service/start'] } }], 'a filter: at each node it selects, in order')
  t.alike(seen.at, [['main', 'swarms/swarm-1'], ['main', 'swarms/swarm-3']])
  t.alike(await goto(exec, { uri: ['main', 'swarms/*[size>100]'], args: ['service/start'] }), [], 'nothing selected: an empty list, not an error')
  t.alike((await goto(exec, { uri: ['main', 'swarms/*[size=1]'], args: ['service/start'] })).map(x => x.at), ['swarms/swarm-2'], 'one selected: a list still, the URI selects')
  t.alike((await goto(exec, { uri: ['main', 'swarms/*'], args: ['x/y'] })).length, 3)
  t.is(seen.sent.length, 0)
})

test('goto: on from one shortcut at a time; what is left of the URI goes with the command', async (t) => {
  const { exec, seen } = context(FILES())
  t.is(await goto(exec, { uri: ['main', 'host/swarms/swarm-1'], args: ['service/start'] }), null, 'a URI through a shortcut: sent on')
  t.alike(seen.sent, [{ to: HOST, command: ['haicc', 'swarms/swarm-1', 'service/start'] }], 'what is left of it a goto there, in front of the command')
  await goto(exec, { uri: ['main', "host[state='started']/swarms/*"], args: ['crud/read', '.'] })
  t.alike(seen.sent.at(-1).command, ['haicc', "[state='started']/swarms/*", 'crud/read', '.'], 'a filter on the shortcut goes with it: its document is there')
  await goto(exec, { uri: ['main', 'links/*'], args: ['service/start'] })
  t.alike([seen.sent.at(-1).to.mrepo, seen.sent.at(-1).command], ['swarm-9/far', ['service/start']], 'selected, the only position: sent on, the command as it is')
  await t.exception(goto(exec, { uri: ['main', '*'], args: ['service/start'] }), /haicc \*: not yet: it reaches a shortcut \(host\) among 3 positions; a command goes on from one shortcut at a time \(haicc host \.\.\.\)/, 'beside ordinary nodes: not yet')
  await t.exception(goto(exec, { uri: ['main', '*/*/x'], args: ['service/start'] }), /not yet: it reaches a shortcut \(host, links\/far\)/, 'several shortcuts: not yet')
  t.is(seen.ran.length, 0, 'nothing executed here')
  t.alike(exec.entries.filter(e => e.event === 'sent on').map(e => [e.at, e.mrepo]), [['host', 'local/host'], ['host', 'local/host'], ['links/far', 'swarm-9/far']])
})

test('the config: goto at any position, the default action', (t) => {
  t.is(CONFIG.default, 'goto')
  t.alike(CONFIG.actions.goto.uris, ['**'])
  t.alike(CONFIG.actions.goto.args, ['command'], 'its argument, named: the command that follows')
  t.absent(CONFIG.gated, 'not behind the service\'s door')
  t.ok(CONFIG.description && CONFIG.actions.goto.description)
})
