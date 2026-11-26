// goto on a context written here: its shortcuts by path; what it runs
// and what it sends on, kept.
import test from 'brittle'
import { goto } from '../index.js'

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
    find: async p => (p in files ? Buffer.from(JSON.stringify(files[p])) : null),
    log: function (level, event, line) { if (typeof line !== 'string') throw new Error('not a log entry: a line'); (this.entries ??= []).push({ level, event, line }) },
    step: async function (event, line, fn, level = 'verbose') { const r = await fn(); const said = typeof line === 'function' ? line(r) : line; if (typeof said !== 'string') throw new Error('not a log entry: a line'); (this.entries ??= []).push({ level, event, line: said }); return r },
    run: async (command, opts) => { seen.ran.push(command); seen.at.push(opts?.at); return said(command) },
    forward: (to, command) => { seen.sent.push({ to, command }); return null }
  }
  return { exec, seen }
}
// what a command run here says, as exec.run gives it
const said = command => ({ message: `Ran ${command.join(' ')}.`, attachments: [] })
const FILES = () => ({
  'main/.layer.json': {},
  'main/notes.txt': 'a text',
  'main/host/.node.json': {},
  'main/host/.shortcuts.json': [{ mrepo: 'local/host', link: 'k-host' }],
  'main/swarms/.node.json': {},
  'main/swarms/swarm-1/.node.json': { state: 'started', size: 3 },
  'main/swarms/swarm-2/.node.json': { state: 'stopped', size: 1 },
  'main/swarms/swarm-3/.node.json': { state: 'started', size: 9 },
  'links/k-host.json': { key: 'k-host', uri: 'local/host', at: 'host', folder: '../local/host' },
  'links/k-far.json': { key: 'k-far', uri: 'swarm-9/far', at: 'links/far', folder: '../swarm-9/far' },
  'main/links/.node.json': {},
  'main/links/far/.node.json': {},
  'main/links/far/.shortcuts.json': [{ mrepo: 'swarm-9/far', link: 'k-far' }]
})
const HOST = { at: 'host', mrepo: 'local/host', link: 'k-host', folder: '../local/host', dir: '/work/mrepos/local/host' }

test('goto: at the root executed here; at a shortcut sent on; no command', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', '.'], args: ['boot/deploy', 'host', 'haiccing/base-component-haicc'] }), said(['boot/deploy', 'host', 'haiccing/base-component-haicc']), 'main, the root position: the command executed here, what it says returned')
  t.alike(seen.at, [['main']], 'the command that follows stands at the position: its URI is read behind that prefix')
  t.is(await goto(exec, { uri: ['main', 'host'], args: ['haicc', 'swarms/swarm-1', 'boot/deploy', 'node-1'] }), null, 'a shortcut: sent on')
  t.alike(seen.sent, [{ to: HOST, command: ['haicc', 'swarms/swarm-1', 'boot/deploy', 'node-1'] }], 'the command that follows, unchanged, to the mrepo linked there')
  t.is(seen.ran.length, 1, 'nothing of it executed here')
  await t.exception(goto(exec, { uri: ['main', 'host'] }), /missing argument: command/)
  await t.exception(goto(exec, { uri: ['main', '/host'], args: ['service/start'] }), /not a relative URI/)
  await t.exception(goto(exec, { uri: ['runtime'], args: ['service/start'] }), /not a position in main: runtime \(main, main\/<position>\)/)
  await t.exception(goto(exec, { uri: ['mainly/x'], args: ['service/start'] }), /not a position in main/)
})

test('goto: a position inside main: the command executed there, the current root moved', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', 'swarms/swarm-1'], args: ['crud/read', '.'] }), said(['crud/read', '.']), 'a URI that names one position: what the command says, as it is')
  t.alike(seen.at, [['main', 'swarms/swarm-1']], 'the command stands at the position')
  t.alike(await goto(exec, { uri: ['main', 'swarms', 'swarm-2'], args: ['crud/read', '.'] }), said(['crud/read', '.']), 'a goto at a position: its URI read behind it')
  t.alike(seen.at.at(-1), ['main', 'swarms/swarm-2'])
  await t.exception(goto(exec, { uri: ['main', 'nowhere'], args: ['crud/read', '.'] }), /haicc nowhere: no node there/, 'a position named that is not there: an error')
  await t.exception(goto(exec, { uri: ['main', 'swarm-1/node-2'], args: ['crud/read', '.'] }), /haicc swarm-1\/node-2: no node there$/, 'a unique URI that is no position here, in an mrepo that does not dispatch: the same')
  await t.exception(goto(exec, { uri: ['main', 'swarms/swarm-1/state'], args: ['crud/read', '.'] }), /haicc swarms\/swarm-1\/state: not a position \(a node; a value inside a document is none\)/)
  await t.exception(goto(exec, { uri: ['main', 'notes.txt'], args: ['crud/read', '.'] }), /haicc notes\.txt: not a position \(a node; a file is none\)/)
  t.alike(exec.entries.filter(e => e.event === 'executed here').map(e => e.line), ['Executed here, at swarms/swarm-1: crud/read .', 'Executed here, at swarms/swarm-2: crud/read .'])
})

test('goto: a URI that selects: the command executed at each position, a list of what each gave', async (t) => {
  const { exec, seen } = context(FILES())
  t.alike(await goto(exec, { uri: ['main', "swarms/*[state='started']"], args: ['service/start'] }), { message: 'Run at 2 positions.\n\n== swarms/swarm-1\nRan service/start.\n\n== swarms/swarm-3\nRan service/start.', attachments: [] }, 'a filter: at each node it selects, in order, what each says under its position')
  t.alike(seen.at, [['main', 'swarms/swarm-1'], ['main', 'swarms/swarm-3']])
  t.is(await goto(exec, { uri: ['main', 'swarms/*[size>100]'], args: ['service/start'] }), 'No position selected by swarms/*[size>100]: nothing run.', 'nothing selected: said, not an error')
  t.is((await goto(exec, { uri: ['main', 'swarms/*[size=1]'], args: ['service/start'] })).message, 'Run at 1 position.\n\n== swarms/swarm-2\nRan service/start.', 'one selected: under its position still, the URI selects')
  t.is((await goto(exec, { uri: ['main', 'swarms/*'], args: ['x/y'] })).message.split('\n')[0], 'Run at 3 positions.')
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
  t.alike(exec.entries.filter(e => e.event === 'sent on').map(e => e.line.split(':')[0]), ['Sent on at host, to local/host', 'Sent on at host, to local/host', 'Sent on at links/far, to swarm-9/far'])
})


test('haicc/script: the lines, each a simple command, run where the URI points; the request waits for them', async (t) => {
  const { script } = await import('../index.js'); const { parse, words } = await import('mrepo-base-request')
  t.alike(words(`crud/create swarms/swarm-1 '{"kind":"swarm"}'`), ['crud/create', 'swarms/swarm-1', '{"kind":"swarm"}'], 'split as the shell splits: a quoted part one word, its quotes off')
  t.alike(words('a "b \\"c\\" d" e'), ['a', 'b "c" d', 'e'], 'in double quotes, a backslash keeps the next character')
  t.exception(() => words("a 'b"), /a quote not closed/)
  t.alike(parse('\n# the swarm\nservice/initialise\n\n  service/start  \n').map(l => [l.n, l.words]), [[3, ['service/initialise']], [5, ['service/start']]], 'blank lines and comments skipped; each line its number')
  t.exception(() => parse(' \n# only\n'), /missing argument: script/)
  const waited = []
  const exec = { runtime: { dir: '/x', uri: 'local/host' }, resumed: null, log: () => {}, wait: job => { waited.push(job); return null }, find: async p => (p === '/runtime/hooks/initialise.haicc' ? Buffer.from('info/extract\n') : null) }
  t.is(await script(exec, { uri: ['main', '.'], args: ['service/initialise\nservice/start'] }), null, 'the request waits for its lines')
  t.is(waited.length, 1, 'one job: the lines, run through the mrepo\'s own inbox')
  t.alike(await script({ ...exec, resumed: { status: 'done', message: 'Ran 1 line at ..\n\n> service/start\nThe service is started: its state is started.', attachments: [] } }, { uri: ['main', '.'], args: ['x'] }), { message: 'Ran 1 line at ..\n\n> service/start\nThe service is started: its state is started.', attachments: [] }, 'resumed: what the job returned, each line and what it said')
  await t.exception(script({ ...exec, resumed: { status: 'failed', message: 'line 2: service/start: not now', attachments: [] } }, { uri: ['main', '.'], args: ['x'] }), /line 2: service\/start: not now/, 'resumed with a failure: the line that failed said')
})

test('a node of the swarm by its unique URI: no position here, handed to dispatch where the mrepo has it active', async (t) => {
  const { exec, seen } = context({ ...FILES(), 'protocols/dispatch.json': {} })
  t.alike(await goto(exec, { uri: ['main', 'swarm-1/node-2'], args: ['crud/read', '.'] }), said(['dispatch/send', 'swarm-1/node-2', 'crud/read', '.']), 'haicc swarm-1/node-2 crud/read .: dispatch/send, the URI as written, the command after it')
  t.alike(await goto(exec, { uri: ['main', 'swarm-1/node-2/notes'], args: ['crud/read', '.'] }), said(['dispatch/send', 'swarm-1/node-2/notes', 'crud/read', '.']), 'what follows the unique URI goes with it')
  t.alike(seen.sent, [], 'not through a shortcut')
  await goto(exec, { uri: ['main', 'swarms/swarm-1'], args: ['crud/read', '.'] })
  t.alike(seen.ran.at(-1), ['crud/read', '.'], 'a position that is here: executed here, as before')
  await t.exception(goto(exec, { uri: ['main', 'nowhere'], args: ['crud/read', '.'] }), /haicc nowhere: no node there$/, 'one name only: no unique URI, not dispatched')
  const none = context({ ...FILES(), 'protocols/dispatch.json': {} })
  none.exec.run = async () => { throw new Error('no node of the swarm by that unique URI: swarm-1/nope (rns/status says who is registered)') }
  await t.exception(goto(none.exec, { uri: ['main', 'swarm-1/nope'], args: ['crud/read', '.'] }), /haicc swarm-1\/nope: no node there, and no node of the swarm by that unique URI/, 'no node of the swarm either: one error')
  none.exec.run = async () => { throw new Error('not reachable yet: swarm-1/far lives on elsewhere') }
  await t.exception(goto(none.exec, { uri: ['main', 'swarm-1/far'], args: ['crud/read', '.'] }), /not reachable yet/, 'what dispatch refuses otherwise: as it says it')
})
