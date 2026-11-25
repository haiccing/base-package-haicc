import test from 'brittle'
import { spawnSync } from 'bare-subprocess'
import fs, { mkdtempSync, rmSync, existsSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { fileURLToPath } from 'bare-url'
import { openRepo, p2pgitBackend, nativeBackend } from 'mycelium-git'
import { gitdirOf, layer } from 'mrepo-base-request'
import { start, ask, open, commissioned, decommission } from '../index.js'
import { bootedHost, send, sendForm } from './fixture.js'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const alive = pid => spawnSync('kill', ['-0', String(pid)], { stdio: 'ignore' }).status === 0
// its fourth: a document, the crud create's argument (JSON text)
const req = (protocol, action, uri, doc) => ({ protocol, action, uri, ...(doc !== undefined ? { args: [typeof doc === 'string' ? doc : JSON.stringify(doc)] } : {}) })
// The nodes the cycle makes, as crud answers them: the note, its parent.
const HELLO = { uri: ['main', 'notes/hello'], value: { text: 'hi' }, children: [] }
const NOTES = { uri: ['main', 'notes'], value: {}, children: ['hello'] }
const CREATED = [{ ...NOTES, outcome: 'created' }, { ...HELLO, outcome: 'created' }]

// The same cycle on both storages: the p2p host and a repository on native git.
for (const storage of ['p2p', 'git']) {
  test(`the cycle on ${storage}: initialise (preloaded), start, create, read, delete, refused, stop, shutdown`, { timeout: 180000 }, async (t) => {
    const work = mkdtempSync(join(tmpdir(), `cycle-${storage}-`))
    try {
      await bootedHost(work, { storage })
      const s = await start({ work, bundle: join(here, 'test', 'runtime.js') })
      t.ok(s?.pid, 'the runtime started')
      t.is(s.repository.storage, storage)
      t.alike(await send(work, req('service', 'initialise', '.')), { ok: false, error: 'not now: service initialise (the service is initialised)' }, 'initialised already: the preloaded request ran first, this one refused as it executed')
      t.alike(await send(work, req('crud', 'read', '.')), { ok: false, error: 'not now: crud read (crud is not active; the service is initialised)' }, 'before start: crud loaded, not active: nothing is by default')
      t.alike(await send(work, req('protocol', 'activate', '.', 'crud')), { ok: true, value: { activated: 'crud' } }, 'the protocol protocol open from outside: the restrictions lifted for base')
      t.is((await send(work, req('protocol', 'deactivate', '.', 'crud'))).ok, true, 'and closed again')
      t.alike(await send(work, req('service', 'start', '.')), { ok: true, value: { service: 'started', state: 'started' } })
      t.alike(await send(work, req('crud', 'create', 'notes/hello', { text: 'hi' })), { ok: true, value: CREATED }, 'written at main, where the outside stands: the node and the one above it made')
      t.alike(await send(work, req('crud', 'read', 'notes/hello')), { ok: true, value: [HELLO] }, 'read back')
      t.alike(await send(work, req('crud', 'read', 'notes')), { ok: true, value: [NOTES] })
      t.alike(await send(work, ['crud/read', 'notes/hello']), { ok: true, value: [HELLO] }, 'a request sent as a command, its parts: interpreted on its way in')
      t.alike(await send(work, { command: 'crud/read ./notes' }), { ok: true, value: [NOTES] }, 'as a string; ./ in front allowed')
      t.alike(await send(work, ['crud']), { ok: false, error: 'no action: crud (crud has no default action)' }, 'not a command that can be told: refused')
      t.alike(await send(work, req('crud', 'read', '.')), { ok: true, value: [{ uri: ['main', '.'], value: {}, children: ['notes'] }] }, '. from outside: main itself')
      t.alike(await send(work, req('crud', 'update', 'notes', 1)), { ok: false, error: 'no action: crud update (create, delete, read)' }, 'the API: only what it offers')
      t.alike(await send(work, req('crud', 'delete', 'notes')), { ok: false, error: 'notes has children: not deleted (crud/delete notes recurse)' }, 'failed in execution: answered')
      t.alike(await send(work, req('crud', 'read', '.'), { to: '/elsewhere/inbox' }), { ok: false, error: 'misdelivered: for /elsewhere/inbox, this is /host/inbox' }, 'an envelope for another inbox: refused')
      const form = await sendForm(work, req('crud', 'read', 'notes/hello'))
      t.is(form.topic, '/haicc/terminal', 'back: the core, its topic the sender')
      t.alike(form.headers, {}, 'no headers yet')
      const { log, ...asked } = form.value
      t.alike(asked, { protocol: 'crud', action: 'read', uri: ['main', 'notes/hello'], output: [HELLO] }, 'the form completed: the request, its URI as held inside, and its output')
      t.alike(log.map(e => [e.level, e.event]), [['info', 'request.metrics']], 'and its log: at info, a read changes nothing, its metrics')
      t.alike([log[0].ok, log[0].puts, log[0].commits], [true, 0, 0])
      const told = (await sendForm(work, { command: ['crud/read', 'notes/hello', '--flags', 'log=verbose'] })).value
      t.alike(told.flags, { log: 'verbose' }, 'flags written with a command: in the form, as written')
      t.alike(told.log.map(e => [e.level, e.event]), [['verbose', 'crud.read.query'], ['verbose', 'crud.read.segment'], ['verbose', 'crud.read.batch'], ['info', 'request.metrics']], 'log=verbose: the action\'s steps too: its query, its rounds, the batch its result was read with')
      const odd = (await sendForm(work, { command: ['crud/read', 'notes/hello', '--flags', 'log=verbose', 'nope'] })).value
      t.alike([odd.output, 'error' in odd], [{ run: false, command: 'crud/read notes/hello --flags log=verbose nope', why: ['no flag: nope (container, feedback, help, layer, log, logical, physical)'] }, false], 'a flag that is none: nothing of it run; completed, not failed, said why')
      t.alike(odd.log.map(e => [e.level, e.event, e.reason]), [['warn', 'request.flag', 'no flag: nope (container, feedback, help, layer, log, logical, physical)']], 'the reason a warning in its log')
      t.alike(await send(work, req('crud', 'delete', 'notes', 'recurse')), { ok: true, value: [{ ...NOTES, outcome: 'deleted' }] }, 'deleted, with what was below it')
      t.alike(await send(work, req('service', 'stop', '.')), { ok: true, value: { service: 'stopped', state: 'initialised' } })
      t.alike(await send(work, req('crud', 'read', '.')), { ok: false, error: 'not now: crud read (crud is not active; the service is initialised)' }, 'stopped: crud deactivated by the stop hook, not available')
      t.alike(await send(work, req('service', 'shutdown', '.')), { ok: true, value: { service: 'shut down', state: 'booted' } })
      t.ok(alive(s.pid), 'shut down: its service booted again, the runtime still running (it runs until stopped)')
      t.ok((await ask({ work, op: 'stop' }))?.stopping, 'asked to stop')
      for (let i = 0; i < 100 && alive(s.pid); i++) await wait(100)
      t.absent(alive(s.pid), 'stopped')
      t.is(await ask({ work, op: 'status' }), null)
      // The record: every request in request/done; the boxes kept.
      const r = await open(work)
      try {
        const repo = openRepo(r.backend)
        const done = await layer({ repo }, 'request/done').list()
        t.is(done.length, 29, 'every request done, the refused ones too, the protocol protocol opened by the runtime, and each hook line its own request')
        const recs = await Promise.all(done.map(n => layer({ repo }, 'request/done').read(n)))
        t.ok(recs.every(x => x.topic === '/request/done' && ('output' in x.value.value || 'error' in x.value.value)), 'each in its envelope at its topic, its form completed')
        t.is(recs.filter(x => x.value.topic === null).length, 5, 'no sender: the preloaded one, the protocol protocol opened by the runtime, and the hook lines (boot, start, stop), the mrepo\'s own internal requests')
        t.alike((await repo.select('/protocols/*')).map(([p]) => p), ['/protocols/protocol.json', '/protocols/service.json'], 'the active set: protocol (the runtime\'s own), service (the boot hook); crud activated by start, deactivated by stop')
        t.alike((await r.backend.listBranches()).map(([b]) => b).filter(b => !b.startsWith('execute/')).sort(), ['inbox', 'main', 'outbox', 'packages', 'protocols', 'request/done', 'request/execute', 'request/pending/default', 'runtime', 'xpath/log'], 'the layers (the execution branches not among them)')
        t.alike(await repo.select('/request/execute/*'), [], 'nothing left executing')
        t.alike(await repo.select('/main/*'), [], 'main: the note deleted again')
        t.is((await layer({ repo }, 'inbox').list()).length, 22, 'the inbox: every envelope posted, kept (housekeeping later); the hook lines not among them: internal')
        t.is((await layer({ repo }, 'outbox').list()).length, 22, 'the outbox: every completed form sent back')
        t.is(JSON.parse((await repo.read('/runtime/service.json')).toString()).state, 'booted')
        // the xpath layer's log: what the physical side did for each request
        // that queried, a record under the request's offset; in its folder
        // as each was made, committed at a checkpoint, apart from any request
        if (storage === 'p2p') {
          const logged = await layer({ repo }, 'xpath/log').list()
          const requests = await layer({ repo }, 'request/done').list()
          t.ok(logged.length > 0 && logged.every(n => requests.includes(n)), 'the physical log: its records committed at a checkpoint, each under its request\'s offset')
          const one = await layer({ repo }, 'xpath/log').read(logged.at(-1))
          t.alike([one.topic, one.offset, one.value.request, Object.keys(one.value.queries[0]).sort()], ['/xpath/log', Number(logged.at(-1)), Number(logged.at(-1)), ['from', 'logical', 'mode', 'ms', 'physical', 'returned', 'type']], 'a record: the request, its command, each physical query: the logical one it stood for, from where, its text, how many came, how long')
          t.ok(await repo.find(`/xpath/log/${logged[0].slice(0, 5)}/${logged[0].slice(0, 6)}/${logged[0]}.json`), 'a streaming layer, by its config: in folders by its offset\'s digits')
        }
      } finally { await r.close() }
      t.absent(existsSync(join(work, 'mrepos', 'host', 'log')), 'no log folder')
      // One request's journey, as the records show it: the put of the note,
      // posted, done, sent back; each move a commit of the request layers.
      const r2 = await open(work)
      try {
        const repo = openRepo(r2.backend)
        let name = null
        for (const n of await layer({ repo }, 'inbox').list()) {
          const env = await layer({ repo }, 'inbox').read(n)
          if (env.value.value.action === 'create' && env.value.value.uri === 'notes/hello') { name = n; break }
        }
        const input = await layer({ repo }, 'inbox').read(name)
        const done = await layer({ repo }, 'request/done').read(name)
        const output = await layer({ repo }, 'outbox').read(name)
        t.alike([input.topic, done.topic, output.topic], ['/host/inbox', '/request/done', '/outbox'], 'each place: a new envelope, its topic the place')
        t.ok([input, done, output].every(r => r.offset === Number(name) && r.value.offset === Number(name)), 'one offset throughout: every envelope, its core, its name in every layer')
        t.ok(await repo.find(`/request/done/${name.slice(0, 5)}/${name.slice(0, 6)}/${name}.json`), 'done, a streaming layer: in its buckets')
        t.alike(done.value, output.value, 'the core completed: in done, and sent back')
        const { log: written, ...completed } = done.value.value
        t.alike({ ...input.value, value: { ...input.value.value, uri: ['main', 'notes/hello'], output: CREATED } }, { ...done.value, value: completed }, 'the core as posted, its URI as held inside, completed (its output)')
        t.alike(written.map(e => e.event), ['request.changed', 'request.metrics'], 'and its log: what it changed, its metrics')
        t.alike([written[0].target, written[0].added], ['main', ['notes/.node.json', 'notes/hello/.node.json']], 'its audit: the paths it added in main')
        t.comment(`the journey of ${name} (${storage}): the input, the done request, the output, as records`)
        t.comment(`input  ${JSON.stringify(input)}`)
        t.comment(`done   ${JSON.stringify(done)}`)
        t.comment(`output ${JSON.stringify(output)}`)
      } finally { await r2.close() }
    } finally { rmSync(work, { recursive: true, force: true }) }
  })
}

test('where the layers live on the p2p host: the atomic ones in the store, the rest on disk', { timeout: 120000 }, async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'cycle-where-'))
  try {
    await bootedHost(work)
    const s = await start({ work, bundle: join(here, 'test', 'runtime.js') })
    t.alike(await send(work, req('service', 'start', '.')), { ok: true, value: { service: 'started', state: 'started' } })
    t.alike(await send(work, req('crud', 'create', 'x')), { ok: true, value: [{ uri: ['main', 'x'], value: {}, children: [], outcome: 'created' }] })
    await send(work, req('service', 'stop', '.'))
    await send(work, req('service', 'shutdown', '.'))
    await ask({ work, op: 'stop' })
    for (let i = 0; i < 100 && alive(s.pid); i++) await wait(100)
    const onDisk = (await p2pgitBackend(join(work, 'mrepos', 'host', '.git'), { fs }).listBranches()).map(([n]) => n)
    t.alike(onDisk, ['inbox', 'outbox', 'request/done', 'request/execute', 'request/pending/default', 'xpath/log'], 'on disk: the boxes, the request layers, the xpath layer\'s log (a request\'s execution branches there too while it runs: none left)')
    const { openStore } = await import('p2p-store')
    const { mrepos } = await import('p2p-mrepo')
    const store = await openStore({ storage: join(work, 'store') })
    try {
      const host = await mrepos({ store }).open('host')
      t.alike((await host.backend.listBranches()).map(([n]) => n), ['main', 'packages', 'protocols', 'runtime'], 'in the store: the atomic layers only')
    } finally { await store.close() }
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('commission and decommission: the commission hook run after the boot, at every start (a restart runs it again, idempotent), its state in the status, waited for; a decommission asked, its lines run; a line that fails said', { timeout: 120000 }, async (t) => {
  for (const [name, more, expect] of [
    ['done', { commission: 'crud/create notes/commissioned\n', decommission: 'crud/create notes/decommissioned\n' }, { state: 'done' }],
    ['failed', { commission: 'crud/create notes/a\ncrud/create .\ncrud/create notes/b\n' }, null],
    ['none', {}, { state: 'none' }]
  ]) {
    const work = mkdtempSync(join(tmpdir(), `commission-${name}-`))
    try {
      await bootedHost(work, { more, storage: 'git' })
      const s = await start({ work, bundle: join(here, 'test', 'runtime.js') })
      t.ok(s?.commission, `${name}: its commission in the status from the start: ${s?.commission?.state}`)
      const c = await commissioned({ work, wait: 60000 })
      if (expect) t.alike(c, expect, `${name}: waited for until it is ${expect.state}`)
      else {
        t.is(c.state, 'failed', 'failed: said')
        t.ok(/^line 2: crud\/create \.: missing argument: target/.test(c.error), `the line that failed and why: ${c.error}`)
      }
      const repo = () => openRepo(nativeBackend(gitdirOf(work, 'host')))
      if (name === 'done') {
        t.ok(await repo().find('/main/notes/commissioned/.node.json'), 'its lines run as the mrepo\'s own: before its start, crud not active, not asked')
        t.alike(await decommission({ work }), { ok: true, decommission: 'done' }, 'a decommission asked: its lines run, answered when done')
        t.ok(await repo().find('/main/notes/decommissioned/.node.json'), 'what its lines did')
        t.alike((await ask({ work, op: 'status' }))?.commission, { state: 'done' }, 'done, said in the status')
      }
      if (name === 'none') t.alike(await decommission({ work }), { ok: true, decommission: 'none' }, 'no decommission hook: none')
      if (name === 'failed') t.absent(await repo().find('/main/notes/b/.node.json'), 'nothing after the line that failed')
      t.ok((await ask({ work, op: 'stop' }))?.stopping, 'stopped')
      for (let i = 0; i < 100 && alive(s.pid); i++) await wait(100)
      t.absent(alive(s.pid))
      if (name === 'done') {
        // started again (a restart; a replica's runtime, with its container):
        // its commission run again, its lines idempotent
        t.absent(await repo().find('/runtime/commission.json'), 'nothing recorded of it: no marker')
        const again = await start({ work, bundle: join(here, 'test', 'runtime.js') })
        t.ok(again?.commission, 'started again: its commission there again')
        t.alike(await commissioned({ work, wait: 60000 }), { state: 'done' }, 'run again, done: what it made there already, left as it is')
        await ask({ work, op: 'stop' })
        for (let i = 0; i < 100 && alive(again.pid); i++) await wait(100)
      }
    } finally { rmSync(work, { recursive: true, force: true }) }
  }
})
