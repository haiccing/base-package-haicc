// The package's protocol as it is mounted: its protocol.js, what a runtime
// loads, its config value by value, and its action run on a minimal
// execution, in memory: the shortcuts it reads by URI, what it executes
// here and what it sends on, kept. No mrepo is built. Every action the
// config names must be run here: the last test fails when one was left out.
import test from '../../modules/node_modules/brittle/index.js'
import * as mounted from '../../protocol.js'

const ran = new Set()
// an action that wrote into the execution's log as it ran: every one must
const logged = new Set()
const act = async (name, exec, form) => {
  ran.add(name)
  const before = exec.entries?.length ?? 0
  // (one refused has logged too, before it threw)
  try { return await mounted.actions.haicc[name](exec, form) } finally { if ((exec.entries?.length ?? 0) > before) logged.add(name) }
}

// An execution as the action sees it: this mrepo's folder, its files by
// path, read as a tree; a command executed here answers with what it was
// given, and where it stood.
function execution (files = {}) {
  const executed = []
  const sent = []
  const kind = p => (p in files ? 'blob' : Object.keys(files).some(f => f.startsWith(p + '/')) ? 'tree' : null)
  const exec = {
    runtime: { dir: '/work/mrepos/boot' },
    // an execution context, standing in: the tree (a node its path here),
    // the log (kept: entries), a step run as it is
    node: async u => (kind(u) ? { type: kind(u), p: u } : null),
    children: async n => (n.type === 'blob' ? null : [...new Set(Object.keys(files).filter(f => f.startsWith(n.p + '/')).map(f => f.slice(n.p.length + 1).split('/')[0]))].sort().map(name => [name, { type: kind(`${n.p}/${name}`), p: `${n.p}/${name}` }])),
    bytes: async n => Buffer.from(JSON.stringify(files[n.p])),
    find: async p => (p in files ? Buffer.from(JSON.stringify(files[p])) : null),
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r },
    run: async (command, opts) => { executed.push(command); return { executed: command, at: opts?.at } },
    forward: (to, command) => { sent.push({ to, command }); return null }
  }
  return { exec, executed, sent }
}
const HOST = {
  'main/layer.json': {},
  'main/notes.txt': 'a text',
  'main/host/.node.json': {},
  'main/host/.shortcuts.json': [{ mrepo: 'local/host', link: 'k-host' }],
  'links/k-host.json': { key: 'k-host', uri: 'local/host', at: 'host', folder: '../local/host' },
  'main/swarms/.node.json': {},
  'main/swarms/swarm-1/.node.json': { state: 'started' },
  'main/swarms/swarm-2/.node.json': { state: 'stopped' }
}
const LINK = { at: 'host', mrepo: 'local/host', link: 'k-host', folder: '../local/host', dir: '/work/mrepos/local/host' }

test('what it provides: one protocol, haicc, its config and its action', (t) => {
  t.alike(Object.keys(mounted.protocols), ['haicc'], 'the package provides the haicc protocol, and no other')
  t.alike(Object.keys(mounted.actions), ['haicc'])
  t.alike(Object.keys(mounted.actions.haicc).sort(), Object.keys(mounted.protocols.haicc.actions).sort(), 'a function for every action configured, and no other')
})

test('its config, value by value: goto, the default action, at any position', (t) => {
  const cfg = mounted.protocols.haicc
  t.is(cfg.package, 'haiccing/base-package-haicc', 'the package that brings it')
  t.ok(cfg.description, 'its description')
  t.is(cfg.default, 'goto', 'haicc alone is haicc/goto')
  t.alike(Object.keys(cfg).sort(), ['actions', 'default', 'description', 'package'], 'nothing else')
  t.alike(Object.keys(cfg.actions), ['goto'], 'one action')
  const goto = cfg.actions.goto
  t.alike(goto.uris, ['**'], 'at any position: the root, a shortcut, deeper')
  t.alike(goto.args, ['command'], 'one argument, required and named: the command that follows')
  t.ok(goto.description, 'its description')
  t.is(goto.command, true, 'the words after its URI are a command, passed on as written: a flag list among them is that command\'s')
  t.alike(Object.keys(goto).sort(), ['args', 'command', 'description', 'uris'], 'nothing else: no target, no states: not behind the service\'s door, the command that follows is checked where it is executed')
})

test('goto at the root: the command that follows executed here, its value returned', async (t) => {
  const { exec, executed, sent } = execution(HOST)
  const command = ['boot/deploy', 'host', 'haiccing/base-component-haicc']
  t.alike(await act('goto', exec, { uri: ['main', '.'], args: command }), { executed: command, at: ['main'] }, 'what the command returns; it stood at main')
  t.alike([executed, sent], [[command], []], 'executed once, as it was given; nothing sent on')
})

test('goto at a position inside main: executed there; a URI that selects: at each, a list', async (t) => {
  const { exec, executed, sent } = execution(HOST)
  t.alike(await act('goto', exec, { uri: ['main', 'swarms/swarm-1'], args: ['crud/read', '.'] }), { executed: ['crud/read', '.'], at: ['main', 'swarms/swarm-1'] }, 'one position named: the command stands there, its value as it is')
  t.alike(await act('goto', exec, { uri: ['main', 'swarms/*'], args: ['crud/read', '.'] }), [{ at: 'swarms/swarm-1', value: { executed: ['crud/read', '.'], at: ['main', 'swarms/swarm-1'] } }, { at: 'swarms/swarm-2', value: { executed: ['crud/read', '.'], at: ['main', 'swarms/swarm-2'] } }], 'a selection: the command at each position, what each gave')
  t.alike((await act('goto', exec, { uri: ['main', "swarms/*[state='stopped']"], args: ['service/start'] })).map(x => x.at), ['swarms/swarm-2'], 'a filter on the nodes\' documents')
  t.alike(await act('goto', exec, { uri: ['main', "swarms/*[state='gone']"], args: ['service/start'] }), [], 'nothing selected: an empty list')
  t.alike([executed.length, sent], [4, []], 'nothing sent on')
})

test('goto at a shortcut: the command sent on to the mrepo linked there, with what is left of the URI', async (t) => {
  const { exec, executed, sent } = execution(HOST)
  const command = ['haicc', 'node-1', 'service/start']
  t.is(await act('goto', exec, { uri: ['main', 'host'], args: command }), null, 'nothing returned here: the request waits for the linked mrepo\'s response')
  t.alike(sent, [{ to: LINK, command }], 'where it leads: the linked mrepo, its folder as its link\'s record says it; the command as it was, a haicc of its own included: commands chain')
  t.is(await act('goto', exec, { uri: ['main', 'host/swarms/*'], args: ['service/start'] }), null, 'a URI through the shortcut: sent on too')
  t.alike(sent[1], { to: LINK, command: ['haicc', 'swarms/*', 'service/start'] }, 'what is left of the URI a goto there, in front of the command')
  t.alike(executed, [], 'nothing of it executed here')
})

test('goto: what it refuses', async (t) => {
  const { exec, executed, sent } = execution(HOST)
  await t.exception(act('goto', exec, { uri: ['main', 'host'] }), /missing argument: command/, 'no command follows')
  await t.exception(act('goto', exec, { uri: ['main', '.'], args: [] }), /missing argument: command/, 'an empty one neither')
  await t.exception(act('goto', exec, { uri: ['main', 'nowhere'], args: ['boot/deploy', 'node-1'] }), /haicc nowhere: no node there/, 'a position named that is not there')
  await t.exception(act('goto', exec, { uri: ['main', 'notes.txt'], args: ['service/start'] }), /not a position/, 'a file is no position')
  await t.exception(act('goto', exec, { uri: ['main', '*'], args: ['service/start'] }), /not yet: it reaches a shortcut \(host\) among 2 positions; a command goes on from one shortcut at a time/, 'a shortcut beside other positions: not yet, said so')
  await t.exception(act('goto', exec, { uri: ['main', 'Host'], args: ['service/start'] }), /not canonical: Host \(host\)/, 'a URI that is not canonical')
  await t.exception(act('goto', exec, { uri: ['runtime/hooks'], args: ['service/start'] }), /not a position in main/)
  t.alike([executed, sent], [[], []], 'a refusal executes nothing and sends nothing')
})

test('every action the config names was run here', (t) => {
  t.alike([...ran].sort(), Object.keys(mounted.protocols.haicc.actions).sort(), 'none left out: an action added without its test fails this')
  t.alike([...logged].sort(), Object.keys(mounted.protocols.haicc.actions).sort(), 'and each wrote into the request\'s log as it ran: an action that logs nothing fails this')
})
