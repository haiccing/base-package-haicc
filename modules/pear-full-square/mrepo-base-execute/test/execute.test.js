import test from 'brittle'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { openStore } from 'p2p-store'
import { mrepos } from 'p2p-mrepo'
import { openRepo, writer } from 'mycelium-git'
import { layer, record, wrap, complete, tick, nameOf, begin, request, principals, inboxOf, outboxOf, EXECUTE } from 'mrepo-base-request'
import { bootedHost, PROTOCOLS } from 'mrepo-base-runtime/test/fixture.js'
import { initialise, start, stop, shutdown } from 'mrepo-base-service'
import { activate, deactivate } from 'mrepo-base-protocol'
import { create, read, remove } from 'mrepo-base-crud'
import { execute, executed, failed } from '../index.js'

// The protocols as packages would offer them: crud, service, protocol (the
// fixture's hooks activate with it).
const CRUD = { crud: { create, read, delete: remove } }
const ALL = { ...CRUD, service: { initialise, start, stop, shutdown }, protocol: { activate, deactivate } }
const any = { uris: ['**'] }

// The runtime's context over a booted host, in this process.
async function withHost (work, fn) {
  const store = await openStore({ storage: join(work, 'store') })
  try {
    const host = await mrepos({ store, local: join(work, 'mrepos') }).open('host')
    return await fn({ work, name: host.name, backend: host.backend, repo: openRepo(host.backend), writer: writer(host.backend), protocols: PROTOCOLS })
  } finally { await store.close() }
}
const json = async (repo, p) => JSON.parse((await repo.read(p)).toString())
const run = async (ctx, value) => {
  const name = `${Date.now()}-00000000`
  await begin(ctx, name, record('/haicc/terminal', { ...value }))
  await execute(ctx, { actions: ALL })
  const core = (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value
  return 'output' in core.value ? { ok: true, value: core.value.output } : 'error' in core.value ? { ok: false, error: core.value.error } : null
}

test('execute: execution branches from their targets, the record completed, squashed into each target', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      let r = await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      t.alike(r, { ok: true, value: { service: 'initialised', state: 'initialised' } })
      t.is((await json(ctx.repo, '/runtime/service.json')).state, 'initialised', 'squashed into runtime')
      r = await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      const mainBefore = (Object.fromEntries(await ctx.backend.listBranches())).main
      r = await run(ctx, { protocol: 'crud', action: 'create', uri: ['main', 'a/b'], args: ['{"n":1}'] })
      t.alike(r, { ok: true, value: [{ uri: ['main', 'a'], value: {}, children: ['b'], outcome: 'created' }, { uri: ['main', 'a/b'], value: { n: 1 }, children: [], outcome: 'created' }] }, 'completed: its form filled in, merged into request/execute; what it made read back in the same execution')
      t.alike(await json(ctx.repo, '/main/a/b/.node.json'), { n: 1 }, 'in main')
      const squashed = await ctx.backend.readCommit((Object.fromEntries(await ctx.backend.listBranches())).main)
      t.alike(squashed.parents, [mainBefore], 'one commit in main, its only parent main as it was: the request\'s own commits not in main\'s history')
      t.ok(/: crud create main\/a\/b/.test(squashed.message), 'saying the request')
      t.alike((await ctx.backend.listBranches()).map(([b]) => b).filter(b => b.startsWith('execute/')), [], 'its execution branches, its own by its key: squashed and removed')
      const before = (Object.fromEntries(await ctx.backend.listBranches())).main
      r = await run(ctx, { protocol: 'crud', action: 'delete', uri: ['main', 'a'] })
      t.alike(r, { ok: false, error: 'a has children: not deleted (crud/delete a recurse)' }, 'failed: its result said')
      t.is((Object.fromEntries(await ctx.backend.listBranches())).main, before, 'and main untouched')
      r = await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      t.alike(r, { ok: false, error: 'not now: service start (the service is started)' }, 'checked again as it executes')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('the execution context: read-only to the action, the runtime\'s context read through it', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      let seen = null
      const actions = { ...ALL, service: { ...ALL.service, initialise: async exec => { seen = { frozen: Object.isFrozen(exec) && Object.isFrozen(exec.runtime), id: exec.id, name: exec.runtime.name, writer: 'writer' in exec.runtime, branches: (await exec.runtime.branches()).includes('runtime'), service: JSON.parse((await exec.runtime.read('/runtime/service.json')).toString()).state }; return 'seen' } } }
      const name = nameOf(tick())
      await begin(ctx, name, record(null, { protocol: 'service', action: 'initialise', uri: ['.'] }, Number(name)))
      await execute(ctx, { actions })
      t.alike(seen, { frozen: true, id: name, name: 'host', writer: false, branches: true, service: 'booted' }, 'the request\'s id, its record\'s key')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('local commit and rollback in an action; the global commit at its end, a failure rolling back globally', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      let seen = null
      const go = (fail) => ({ ...CRUD, crud: { ...CRUD.crud, create: async exec => {
        exec.put('/main/step.json', Buffer.from('1'))
        await exec.commit('first')
        seen = { work: exec.runtime.work, read: (await exec.read('/main/step.json')).toString() }
        exec.remove('/main/step.json')
        exec.put('/main/done.json', Buffer.from('2'))
        if (fail) throw new Error('failed after a local commit')
        return 'ok'
      } } })
      const main = async () => (Object.fromEntries(await ctx.backend.listBranches())).main
      const at = async (repo, p) => (await repo.select(p)).length > 0
      const one = async (fail) => {
        const name = nameOf(tick())
        await begin(ctx, name, record(null, { protocol: 'crud', action: 'create', uri: ['main', 'x'], args: ['1'] }, Number(name)))
        await execute(ctx, { actions: go(fail) })
        return (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value
      }
      const before = await main()
      const bad = await one(true)
      t.is(bad.error, 'failed after a local commit')
      t.is(await main(), before, 'failed: main untouched')
      t.alike((await ctx.backend.listBranches()).map(([b]) => b).filter(b => b.startsWith('execute/')), [], 'its local commit undone: its execution branches discarded')
      const good = await one(false)
      t.is(good.output, 'ok')
      t.alike(seen, { work, read: '1' }, 'after a local commit, reads see it; the work folder in the context')
      t.ok(await at(ctx.repo, '/main/done.json'), 'merged at the end')
      t.absent(await at(ctx.repo, '/main/step.json'), 'with what followed the local commit')
      // discard: the uncommitted writes; rollback: the last local commit
      const back = { ...CRUD, crud: { ...CRUD.crud, create: async exec => {
        exec.put('/main/committed.json', Buffer.from('3'))
        await exec.commit()
        exec.put('/main/dropped.json', Buffer.from('4'))
        exec.discard()
        exec.put('/main/undone.json', Buffer.from('5'))
        await exec.commit()
        await exec.rollback()
        const n = async p => (await exec.select(p)).length
        const after = { committed: await n('/main/committed.json'), dropped: await n('/main/dropped.json'), undone: await n('/main/undone.json') }
        exec.put('/main/kept.json', Buffer.from('6'))
        return after
      } } }
      const name = nameOf(tick())
      await begin(ctx, name, record(null, { protocol: 'crud', action: 'create', uri: ['main', 'x'], args: ['1'] }, Number(name)))
      await execute(ctx, { actions: back })
      t.alike((await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value.output, { committed: 1, dropped: 0, undone: 0 }, 'discard dropped the uncommitted; rollback undid the last commit, not the one before')
      t.ok(await at(ctx.repo, '/main/committed.json'), 'merged: what stayed committed')
      t.absent(await at(ctx.repo, '/main/dropped.json'))
      t.absent(await at(ctx.repo, '/main/undone.json'))
      t.ok(await at(ctx.repo, '/main/kept.json'))
      // reset: everything of the execution ditched, local commits too
      const ditch = { ...CRUD, crud: { ...CRUD.crud, create: async exec => {
        exec.put('/main/first.json', Buffer.from('6'))
        await exec.commit()
        exec.put('/main/second.json', Buffer.from('7'))
        await exec.reset()
        const after = (await exec.select('/main/first.json')).length
        exec.put('/main/fresh.json', Buffer.from('8'))
        return { after }
      } } }
      const n2 = nameOf(tick())
      await begin(ctx, n2, record(null, { protocol: 'crud', action: 'create', uri: ['main', 'x'], args: ['1'] }, Number(n2)))
      await execute(ctx, { actions: ditch })
      t.alike((await json(ctx.repo, `/${EXECUTE}/${n2}.json`)).value.value.output, { after: 0 }, 'reset: back to the start, its local commit undone')
      t.absent(await at(ctx.repo, '/main/first.json'), 'nothing before the reset merged')
      t.absent(await at(ctx.repo, '/main/second.json'))
      t.ok(await at(ctx.repo, '/main/fresh.json'), 'what came after it: merged')
      t.ok(await at(ctx.repo, '/main/kept.json'), 'what the action wrote after it: merged')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('the request\'s log: info unasked (its audit, its metrics), the action\'s entries under its name, as much as its flag asks', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      const logging = { ...CRUD, crud: { ...CRUD.crud, read: async exec => {
        await exec.read('main/a/.node.json')
        exec.log('info', 'step', { n: 1 })
        exec.log('verbose', 'more')
        exec.log('debug', 'detail')
        exec.log('warn', 'careful')
        t.exception(() => exec.log('loud', 'x'), /not a log level/)
        exec.put('main/logged.json', Buffer.from('{}'))
        return 'logged'
      } } }
      await run(ctx, { protocol: 'crud', action: 'create', uri: ['main', 'a'] })
      const one = async flags => {
        const name = nameOf(tick())
        await begin(ctx, name, record(null, { protocol: 'crud', action: 'read', uri: ['main', '.'], ...(flags ? { flags } : {}) }, Number(name)))
        await execute(ctx, { actions: logging })
        return (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value
      }
      const events = done => done.log.map(e => [e.level, e.event])
      const done = await one()
      t.is(done.output, 'logged')
      t.alike(events(done), [['info', 'crud.read.step'], ['warn', 'crud.read.careful'], ['info', 'request.changed'], ['info', 'request.metrics']], 'without a flag: info, and a warning; the action\'s entries under its protocol and action; then the boundary\'s own')
      t.is(done.log[0].n, 1, 'with its data')
      t.ok(done.log[0].time, 'and its time')
      const [changed, metrics] = done.log.slice(-2)
      t.alike({ target: changed.target, count: changed.count, added: changed.added, changed: changed.changed, removed: changed.removed }, { target: 'main', count: 1, added: ['logged.json'], changed: [], removed: [] }, 'its audit: what it changed, a target a line')
      t.alike({ ok: metrics.ok, reads: metrics.reads, selects: metrics.selects, puts: metrics.puts, removes: metrics.removes, commits: metrics.commits }, { ok: true, reads: 1, selects: 0, puts: 1, removes: 0, commits: 1 }, 'its metrics: counted at the boundary, the action doing nothing for them')
      t.ok(Number.isInteger(metrics.ms) && metrics.ms >= 0, 'and what it took')
      // as much as its flag asks
      t.alike(events(await one({ log: 'verbose' })).filter(([, e]) => e.startsWith('crud.')), [['info', 'crud.read.step'], ['verbose', 'crud.read.more'], ['warn', 'crud.read.careful']], 'log=verbose: its steps too')
      const debug = await one({ log: 'debug' })
      t.alike(events(debug).filter(([, e]) => e.startsWith('crud.')).map(([l]) => l), ['info', 'verbose', 'debug', 'warn'], 'log=debug: its internals too')
      t.alike(events(debug).filter(([, e]) => e.startsWith('train.')), [['debug', 'train.branch'], ['debug', 'train.commit'], ['debug', 'train.squash'], ['debug', 'train.removed']], 'and the boundary\'s own steps')
      t.ok(debug.log.filter(e => e.event.startsWith('train.')).every(e => Number.isInteger(e.ms)), 'each with what it took')
      // a flag that is not one, or a value its flag does not take, past the door (put straight in execution; at the door it is not run): ignored, with a warning
      const odd = await one({ log: 'loud', nope: true })
      t.is(odd.output, 'logged', 'the request done all the same')
      t.alike(odd.log.filter(e => e.event === 'request.flag').map(e => [e.level, e.flag, e.ignored]), [['warn', 'log', 'log=loud: not one of info, verbose, debug'], ['warn', 'nope', 'no flag: nope (container, feedback, help, layer, log, physical)']])
      t.absent(odd.log.some(e => e.level === 'verbose'), 'at info, the flag ignored')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('a step of an action: measured at the boundary, what it took and what it read and wrote; a file that may not be there', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      await run(ctx, { protocol: 'crud', action: 'create', uri: ['main', 'a'] })
      const seen = {}
      const stepping = { ...CRUD, crud: { ...CRUD.crud, read: async exec => {
        seen.there = await exec.find('main/a/.node.json')
        seen.not = await exec.find('main/nope/.node.json')
        seen.folder = await exec.find('main/a').then(() => 'found', err => err.message)
        seen.runtime = [await exec.runtime.find('main/a/.node.json'), await exec.runtime.find('main/nope')]
        const main = await exec.node('main')
        const kids = await exec.children(main)
        seen.tree = [main.type, kids.map(([n]) => n).filter(n => !n.startsWith('.') && n !== '.layer.json'), (await exec.bytes((await exec.children(kids.find(([n]) => n === 'a')[1]))[0][1])).toString(), await exec.node('main/nope'), (await exec.runtime.children(await exec.runtime.node('main/a'))).length]
        const found = await exec.step('look', r => ({ found: r.length }), async () => { await exec.read('main/a/.node.json'); return exec.select('main/*') })
        await exec.step('write', { what: 'two' }, async () => { exec.put('main/one.json', Buffer.from('1')); exec.put('main/two.json', Buffer.from('2')); await exec.commit('two') })
        await exec.step('inside', {}, async () => {}, 'debug')
        await exec.step('breaks', { n: 1 }, async () => { throw new Error('broke') }).catch(() => {})
        return found.length
      } } }
      const name = nameOf(tick())
      await begin(ctx, name, record(null, { protocol: 'crud', action: 'read', uri: ['main', '.'], flags: { log: 'verbose' } }, Number(name)))
      await execute(ctx, { actions: stepping })
      const done = (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value
      t.is(done.output, 1)
      t.is(seen.there.toString(), '{}\n', 'find: there, its content')
      t.is(seen.not, null, 'not there: null')
      t.ok(/not a file/.test(seen.folder), 'something else there: thrown, as read throws')
      t.is(seen.runtime[0].toString(), '{}\n', 'the runtime\'s view: the same')
      t.is(seen.runtime[1], null)
      t.alike(seen.tree, ['tree', ['a'], '{}\n', null, 1], 'the tree itself: a node, its children, a file\'s content; the runtime\'s view the same')
      const steps = done.log.filter(e => e.event.startsWith('crud.read.'))
      t.alike(steps.map(e => [e.level, e.event]), [['verbose', 'crud.read.look'], ['verbose', 'crud.read.write'], ['verbose', 'crud.read.breaks']], 'a step: an entry at verbose, under the action\'s name (the one at debug not kept)')
      const [look, write, breaks] = steps
      t.alike({ found: look.found, reads: look.reads, selects: look.selects }, { found: 1, reads: 1, selects: 1 }, 'what the step found (from its result), what it read meanwhile')
      t.alike({ what: write.what, puts: write.puts, commits: write.commits }, { what: 'two', puts: 2, commits: 1 }, 'what it wrote')
      t.ok([look, write, breaks].every(e => Number.isInteger(e.ms)), 'each with what it took')
      t.absent('puts' in look, 'a count that did not move: not said')
      t.alike({ n: breaks.n, failed: breaks.failed }, { n: 1, failed: 'broke' }, 'a step that throws: logged, then thrown on')
      t.alike(done.log.at(-1).reads, 5, 'find counted as a read in the request\'s metrics, a file\'s content too (three finds, bytes and a read; the runtime\'s view is not the execution\'s)')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('an error ends a request at the boundary: what stopped it, its causes, the step it was at, what was undone', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      const failing = { ...CRUD, crud: { ...CRUD.crud, read: async exec => {
        exec.put('main/half.json', Buffer.from('{}'))
        await exec.commit('half')
        exec.log('verbose', 'second')
        try { JSON.parse('{') } catch (err) { throw new Error('reading the second half', { cause: new Error('not a document', { cause: err }) }) }
      } } }
      const one = async flags => {
        const name = nameOf(tick())
        await begin(ctx, name, record(null, { protocol: 'crud', action: 'read', uri: ['main', '.'], ...(flags ? { flags } : {}) }, Number(name)))
        await execute(ctx, { actions: failing })
        return (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value
      }
      const done = await one()
      t.is(done.error, 'reading the second half', 'the request\'s error: what stopped it')
      const failed = done.log.find(e => e.event === 'request.failed')
      t.is(failed.level, 'error', 'an error entry, kept whatever the level')
      t.is(failed.error, 'reading the second half')
      t.is(failed.causes.length, 2, 'the chain of its causes, outermost first')
      t.is(failed.causes[0], 'not a document')
      t.is(failed.at, 'crud.read.second', 'the step the action was at: the last event it logged')
      t.alike(failed.undone, { commits: 1, puts: 1, removes: 0 }, 'what had been done and was undone')
      t.absent('stack' in failed, 'no stack at info')
      t.alike(await ctx.repo.select('/main/half.json'), [], 'undone')
      t.alike(done.log.at(-1).event, 'request.metrics', 'its metrics all the same')
      t.is(done.log.at(-1).ok, false)
      t.ok(Array.isArray((await one({ log: 'debug' })).log.find(e => e.event === 'request.failed').stack), 'its stack at debug')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('a command run in the execution: its entries under its own name, its flags in force from there on', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      const nested = { ...CRUD, crud: { ...CRUD.crud,
        read: async exec => { exec.log('verbose', 'outer'); const r = await exec.run(['crud/delete', 'x', '--flags', 'log=debug']); exec.log('debug', 'after'); return r },
        delete: async exec => { exec.log('debug', 'inner'); return 'ran' }
      } }
      const name = nameOf(tick())
      await begin(ctx, name, record(null, { protocol: 'crud', action: 'read', uri: ['main', '.'] }, Number(name)))
      await execute(ctx, { actions: nested })
      const done = (await json(ctx.repo, `/${EXECUTE}/${name}.json`)).value.value
      t.is(done.output, 'ran')
      t.alike(done.log.filter(e => e.event.startsWith('crud.')).map(e => [e.level, e.event]), [['debug', 'crud.delete.inner'], ['debug', 'crud.read.after']], 'at info until the command run set log=debug; then debug, for what follows too')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('executed: a form completed elsewhere handed over as execute hands one; a runtime merging it first: found done', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      const core = complete(record(null, { protocol: 'service', action: 'boot', uri: ['.'] }, tick()), { ok: true, value: { booted: true } })
      await executed(ctx, nameOf(core.offset), wrap(`/${EXECUTE}`, core))
      t.alike((await json(ctx.repo, `/${EXECUTE}/${nameOf(core.offset)}.json`)).value, core, 'in request/execute, completed')
      t.alike((await ctx.backend.listBranches()).map(([b]) => b).filter(b => b.startsWith('execute/')), [], 'through its own execution branch, removed after')
      // A runtime running on the same repository: it sees the branch as a
      // request completed and merges it first (as execute does), so the
      // merge here finds request/execute moved. Found done, not an error.
      const other = complete(record(null, { protocol: 'service', action: 'boot', uri: ['.'] }, tick()), { ok: true, value: { booted: true } })
      let first = true
      const racing = { ...ctx.writer, merge: async (...a) => { if (first) { first = false; await execute(ctx, { actions: ALL }) } return ctx.writer.merge(...a) } }
      await executed({ ...ctx, writer: racing }, nameOf(other.offset), wrap(`/${EXECUTE}`, other))
      t.absent(first, 'the runtime\'s pass ran between the commit and the merge')
      t.alike((await json(ctx.repo, `/${EXECUTE}/${nameOf(other.offset)}.json`)).value, other, 'merged by the runtime first: in request/execute all the same, once')
      t.alike((await ctx.backend.listBranches()).map(([b]) => b).filter(b => b.startsWith('execute/')), [], 'no branch left')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('failed: a runtime\'s error in the request executing', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      t.alike(await failed(ctx, 'runtime: x'), [], 'none executing: none completed (the caller says it on stderr)')
      const core = record(null, { protocol: 'service', action: 'initialise', uri: ['.'] }, tick())
      await begin(ctx, nameOf(core.offset), core)
      t.alike(await failed(ctx, 'runtime: x'), [nameOf(core.offset)])
      t.is((await json(ctx.repo, `/${EXECUTE}/${nameOf(core.offset)}.json`)).value.value.error, 'runtime: x', 'its form completed with the error: the request protocol moves it to done')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('exec.run: a command executed here; exec.continuation: a script answered with the output; exec.forward: sent on, the principal waiting, returned with the response', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  try {
    await bootedHost(work, { preload: false, hooks: false })
    await withHost(work, async ctx => {
      await run(ctx, { protocol: 'service', action: 'initialise', uri: ['.'] })
      await run(ctx, { protocol: 'service', action: 'start', uri: ['.'] })
      await run(ctx, { protocol: 'crud', action: 'create', uri: ['main', 'x'], args: ['{"n":1}'] })
      // a linked mrepo's folder, as a shortcut would lead to it: its boxes
      const other = join(work, 'other')
      mkdirSync(join(other, 'inbox'), { recursive: true })
      mkdirSync(join(other, 'outbox'), { recursive: true })
      const to = { at: 'other', mrepo: 'local/other', folder: 'other', dir: other }
      const acts = { ...ALL, crud: { ...ALL.crud,
        // the command that follows: executed here
        here: (exec, { args }) => exec.run(args),
        // answered with a continuation: a script for who asked to go on with
        go: (exec, { args = [] }) => { exec.continuation('haicc "$HAICC_AT" service/start\n', 'x'); if (args[0] === 'twice') exec.continuation('true\n'); if (args[0] === 'fail') throw new Error('failed after'); return { ok: 1 } },
        // a job waited for, then executed again with its result
        later: async (exec, form) => {
          if (!form.resumed) { exec.put('/main/early.json', Buffer.from('1')); return exec.wait(async () => { if (form.args?.[0] === 'fail') throw new Error('the job failed'); return 42 }) }
          if (form.resumed.error) throw new Error(`resumed with: ${form.resumed.error}`)
          exec.put('/main/late.json', Buffer.from(JSON.stringify(form.resumed.output)))
          return { resumed: form.resumed }
        },
        // sent on, after a write that must not stay
        there: (exec, { args }) => { exec.put('/main/dropped.json', Buffer.from('1')); return exec.forward(to, args) }
      } }
      const ctx2 = { ...ctx, dir: work, uri: 'local/host', protocols: { ...PROTOCOLS, crud: { actions: { ...PROTOCOLS.crud.actions, here: any, there: any, go: any, later: any } } } }
      const one = async (form) => {
        const name = nameOf(tick())
        await begin(ctx2, name, record(null, form, name))
        await execute(ctx2, { actions: acts })
        return name
      }
      const done = async name => (await json(ctx2.repo, `/${EXECUTE}/${name}.json`)).value.value
      const ran = await done(await one({ protocol: 'crud', action: 'here', uri: ['.'], args: ['crud/read', 'main/x'] }))
      t.alike(ran.output, [{ uri: ['main/x'], value: { n: 1 }, children: [] }], 'exec.run: the command interpreted and its action run in the same execution, its value returned')
      t.is((await done(await one({ protocol: 'crud', action: 'here', uri: ['.'], args: ['crud/update', 'main/x'] }))).error, 'no action: crud update (create, delete, go, here, later, read, there)', 'checked as the request is (internal: no API gate), and its action looked up')

      const gone = await done(await one({ protocol: 'crud', action: 'go', uri: ['.'] }))
      t.alike([gone.output, gone.continuation], [{ ok: 1 }, { at: 'x', script: 'haicc "$HAICC_AT" service/start\n' }], 'exec.continuation: answered beside the output: the script, and the position it is run for')
      t.alike(Object.keys(await done(await one({ protocol: 'crud', action: 'go', uri: ['.'], args: ['fail'] }))).includes('continuation'), false, 'a request that fails answers with none')
      t.is((await done(await one({ protocol: 'crud', action: 'go', uri: ['.'], args: ['twice'] }))).error, 'a continuation already', 'one a request')

      // exec.wait: parked, the runtime free; the job's result collected; executed again with it
      const waiting = await one({ protocol: 'crud', action: 'later', uri: ['.'] })
      const [w1] = (await principals(ctx2)).filter(x => x.id === waiting)
      t.alike([w1.core.value.remote?.folder, w1.core.value.remote?.resume, Boolean(w1.waits)], ['waiting', true, true], 'exec.wait: the request parked, waiting for its job')
      t.absent((await ctx2.repo.select('/main/early.json')).length, 'its writes before it waits: dropped')
      for (let i = 0; i < 20 && !(await layer(ctx2, 'request/done').has(waiting)); i++) { await new Promise(resolve => setTimeout(resolve, 20)); await request(ctx2); await execute(ctx2, { actions: acts }) }
      const resumed = (await layer(ctx2, 'request/done').read(waiting)).value.value
      t.alike(resumed.output, { resumed: { output: 42 } }, 'executed again with the job\'s result, form.resumed')
      t.is((await ctx2.repo.read('/main/late.json')).toString(), '42', 'its writes then: kept')
      const failing = await one({ protocol: 'crud', action: 'later', uri: ['.'], args: ['fail'] })
      for (let i = 0; i < 20 && !(await layer(ctx2, 'request/done').has(failing)); i++) { await new Promise(resolve => setTimeout(resolve, 20)); await request(ctx2); await execute(ctx2, { actions: acts }) }
      t.is((await layer(ctx2, 'request/done').read(failing)).value.value.error, 'resumed with: the job failed', 'a job that fails: resumed with its error, the action says what to do with it')

      const name = await one({ protocol: 'crud', action: 'there', uri: ['main', 'other'], args: ['service/start'] })
      const [p] = (await principals(ctx2)).filter(x => x.id === name)
      t.alike([p.core.value.remote.at, p.core.value.remote.folder, p.waits === p.core.value.remote.offset], ['other', 'other', true], 'exec.forward: the principal waiting on its branch, what it waits for recorded')
      t.absent((await ctx2.repo.select('/main/dropped.json')).length, 'nothing of it executed here: its writes dropped')
      const [arrived] = inboxOf(other).list()
      const sent = inboxOf(other).read(arrived)
      t.alike([sent.topic, sent.value.topic, sent.value.value, sent.offset], ['/local/other/inbox', `/local/host/execute/${name}`, ['service/start'], p.waits], 'in the linked mrepo\'s inbox folder, dropped as everyone drops a record, its offset what this request waits for: addressed to it by its unique URI, the command unchanged, its core addressed back to this request\'s branch')
      // the linked mrepo's response, in its outbox folder: collected, added to
      // the branch, the principal returned with it
      outboxOf(other).put(p.waits, wrap('/outbox', complete({ ...sent.value, value: { command: sent.value.value, protocol: 'service', action: 'start', uri: ['.'], args: [] } }, { ok: true, continuation: { at: '.', script: 'haicc "$HAICC_AT" info/get\n' }, value: { service: 'started' } })))
      for (let i = 0; i < 4; i++) { await request(ctx2); await execute(ctx2, { actions: acts }) }
      const back = (await layer(ctx2, 'request/done').read(name)).value.value
      t.alike(back.output, { service: 'started' }, 'returned with the response: a response is not checked as a request (service start is not allowed here now, the service being started)')
      t.alike(back.continuation, { at: 'other', script: 'haicc "$HAICC_AT" info/get\n' }, 'the linked mrepo\'s continuation comes back with its response, its position seen from here: behind the one the command was sent on at')
      t.alike((await principals(ctx2)).length, 0, 'its branch removed')
    })
  } finally { rmSync(work, { recursive: true, force: true }) }
})
