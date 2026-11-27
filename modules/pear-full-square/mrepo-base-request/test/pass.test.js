import test from 'brittle'
import fs, { mkdtempSync, rmSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { p2pgitBackend, openRepo, writer } from 'mycelium-git'
import { request, admit, internal, ensure, AUTHOR, principals, begin, wrong, refusal, drop, post, layer, record, asked, returned, noted, isReturned, isInternal, outboxOf, nameOf, PENDING, EXECUTE, DONE, TYPES, NONE } from '../index.js'

// The types the mrepo holds, as the runtime read them, stood in for: what it is
// asked noted, a value refused where it carries `odd` (the types themselves
// and the registry are tested where they are: the runtime's package).
const types = () => {
  const asked = []
  return { asked, held: Object.values(TYPES), valid: (type, value) => { asked.push(type); return value && typeof value === 'object' && !('odd' in value) ? { valid: true } : { valid: false, problems: [{ at: 'odd', expected: 'nothing there' }] } } }
}
const protocols = {
  crud: { actions: { read: { uris: ['**'] }, create: { uris: ['<name>/**'], args: ['document'] } } },
  help: { default: 'annotate', actions: { annotate: { uris: ['**'] } } }
}
async function mrepo (t, more = {}) {
  const work = mkdtempSync(join(tmpdir(), 'pass-'))
  t.teardown(() => rmSync(work, { recursive: true, force: true }))
  const dir = join(work, 'mrepos', 'local', 'x')
  const backend = p2pgitBackend(join(dir, '.git'), { fs })
  await backend.init()
  const ctx = { work, dir, name: 'x', uri: 'local/x', backend, repo: openRepo(backend), writer: writer(backend), protocols, types: types(), ...more }
  for (const b of [PENDING, EXECUTE, DONE]) await ensure(ctx, b)
  return ctx
}
const pass = async ctx => { await post(ctx); await request(ctx) }
const from = { from: 'terminal', reply: '/terminal' }
const read = (ctx, branch, name) => layer(ctx, branch).read(name)

test('a request from the inbox: checked by its types, understood from its line, queued, begun on its branch; returned: in done, sent back', async (t) => {
  const ctx = await mrepo(t)
  const o = drop(ctx.dir, ctx.uri, asked('crud/read notes/hello --flags log=debug', from))
  await pass(ctx)
  t.alike(ctx.types.asked, [TYPES.record, TYPES.request], 'the record and the request, each checked by the types the mrepo holds')
  const [p] = await principals(ctx)
  t.alike([p.id, p.waits, p.response], [nameOf(o), null, null], 'begun on its own branch, under its offset')
  t.alike([p.request.command, p.request.form, p.request.returned], ['crud/read notes/hello --flags log=debug', { protocol: 'crud', action: 'read', uri: ['main', 'notes/hello'], args: [], flags: { ...NONE, log: 'debug' } }, null], 'its line as typed; its form understood where the outside stands, its flags each its type')
  t.alike(await layer(ctx, PENDING).list(), [], 'out of the queue')
  t.is(await isInternal(ctx, nameOf(o)), false)
  // execute's part, stood in for: the request returned, in request/execute
  const done = returned(noted(p.request, 'info', 'crud.read', 'Read notes/hello.'), 'done', 'Read notes/hello.', [{ name: 'the document', type: 'haiccing/base-package-crud/document', at: 'main/notes/hello' }])
  const c = await ctx.writer.change(p.branch)
  await c.put(`/${p.id}.json`, Buffer.from(JSON.stringify(record(`/${EXECUTE}`, done, o))))
  await c.commit(`Returned ${p.id}`, { author: AUTHOR })
  await ctx.writer.merge(p.branch, EXECUTE, `Returned ${p.id}`, { author: AUTHOR })
  await ctx.writer.deleteBranch(p.branch, EXECUTE)
  await request(ctx)
  const kept = await read(ctx, DONE, p.id)
  t.alike([kept.topic, kept.offset, kept.value.returned.status], ['/request/done', o, 'done'], 'in done, a record around it, its offset its name')
  const out = outboxOf(ctx.dir).read(o)
  t.alike([out.topic, out.offset, out.value], ['/outbox', o, done], 'sent back: the same request, in its outbox, under the offset it arrived with')
  t.alike(await layer(ctx, EXECUTE).list(), [], 'out of execute')
})

test('refused at the inbox: returned failed, saying why in words; in done, sent back; the next one taken in', async (t) => {
  const ctx = await mrepo(t)
  const dropped = {
    odd: drop(ctx.dir, ctx.uri, { odd: true, reply: '/terminal' }),
    none: drop(ctx.dir, ctx.uri, asked('nope/read x', from)),
    line: drop(ctx.dir, ctx.uri, asked('crud/read "x', from)),
    lacks: drop(ctx.dir, ctx.uri, asked('crud/create notes/a', from)),
    flag: drop(ctx.dir, ctx.uri, asked('crud/read x --flags nope log=loud', from)),
    quiet: drop(ctx.dir, ctx.uri, asked('nope/read x', { from: 'terminal' })),
    good: drop(ctx.dir, ctx.uri, asked('help crud/read', from))
  }
  // misdelivered: a record for another inbox, in this one's folder
  const other = drop(ctx.dir, 'local/y', asked('crud/read x', from))
  await pass(ctx)
  const said = async o => { const r = (await read(ctx, DONE, nameOf(o))).value; return [r.returned.status, r.returned.message] }
  t.alike(await said(dropped.odd), ['failed', 'Refused, nothing run.\nnot a request (haiccing/base-package-runtime/request): odd, expected nothing there'], 'not a request by its type: what is wrong, where')
  t.alike((await read(ctx, DONE, nameOf(dropped.odd))).value.command, null, 'what stands for it: nothing asked')
  t.alike(await said(dropped.none), ['failed', 'Refused, nothing run.\nno protocol: nope ()'], 'the outcome first, then why, a fact a line')
  t.alike(await said(dropped.line), ['failed', 'Refused, nothing run.\nnot a command: crud/read "x (a quote not closed)'])
  t.alike(await said(dropped.lacks), ['failed', 'Refused, nothing run.\nmissing argument: document'])
  t.alike(await said(dropped.flag), ['failed', 'Not run: its flags.\nno flag: nope (container, feedback, help, layer, log, physical)\nlog=loud: not one of info, verbose, debug'], 'its flags: nothing of it run, each reason a line')
  t.alike((await read(ctx, DONE, nameOf(dropped.flag))).value.processing.log.map(e => [e.level, e.event, e.line]), [['warn', 'request.flag', 'no flag: nope (container, feedback, help, layer, log, physical)'], ['warn', 'request.flag', 'log=loud: not one of info, verbose, debug']], 'and each a warning in its log')
  t.alike(await said(other), ['failed', 'Refused, nothing run.\nmisdelivered: for /local/y/inbox, this is /local/x/inbox'])
  const back = outboxOf(ctx.dir)
  t.alike([dropped.odd, dropped.none, dropped.line, dropped.lacks, dropped.flag, other].map(o => back.has(o)), [true, true, true, true, true, true], 'each sent back, where it said its answer goes')
  t.alike(back.read(dropped.none).value.returned, (await read(ctx, DONE, nameOf(dropped.none))).value.returned, 'the same request as in done')
  t.absent(back.has(dropped.quiet), 'one that names nowhere for its answer: kept in done, not sent')
  t.alike((await said(dropped.quiet))[0], 'failed')
  const [p] = await principals(ctx)
  t.alike([p.id, p.request.form], [nameOf(dropped.good), { protocol: 'help', action: 'annotate', uri: ['main', 'crud/read'], args: [], flags: NONE }], 'the one that is right: begun, the refused ones past (its action the protocol\'s default)')
  t.is(refusal('a', 'b'), 'Refused, nothing run.\na\nb')
})

test('its types not held: nothing is taken in', async (t) => {
  const ctx = await mrepo(t, { types: { held: [TYPES.record], valid: () => ({ valid: true }) } })
  const o = drop(ctx.dir, ctx.uri, asked('crud/read x', from))
  await pass(ctx)
  t.alike(wrong(ctx, {}), ['its types are not held here: haiccing/base-package-runtime/request (the mrepo\'s avro layer; nothing is taken in without them)'])
  t.alike((await read(ctx, DONE, nameOf(o))).value.returned, { status: 'failed', message: 'Refused, nothing run.\nits types are not held here: haiccing/base-package-runtime/request (the mrepo\'s avro layer; nothing is taken in without them)', attachments: [] })
  t.alike(await principals(ctx), [])
})

test('the mrepo\'s own: a line or its words, written as anyone writes one; trusted, its URI and its arguments still checked; nobody waits', async (t) => {
  const ctx = await mrepo(t)
  const a = await internal(ctx, ['crud/create', 'notes/a', '{"n": 1}'])
  t.ok(a.queued)
  const queued = (await read(ctx, PENDING, a.name)).value
  t.alike([queued.command, queued.from, queued.to, queued.reply, queued.form.uri, queued.form.args], ['crud/create notes/a "{\\"n\\": 1}"', 'local/x', 'local/x', null, ['main', 'notes/a'], ['{"n": 1}']], 'its words written as a line, read back the same; from and to itself, its answer nowhere')
  t.is(await isInternal(ctx, a.name), true, 'no record of it in the inbox')
  const b = await internal(ctx, 'nope/read x')
  t.ok(b.queued, 'a protocol not loaded: not asked, the mrepo\'s own')
  const c = await internal(ctx, 'crud/create notes/a')
  t.alike([c.refused, (await read(ctx, DONE, c.name)).value.returned.status], ['Refused, nothing run.\nmissing argument: document', 'failed'], 'what its action asks for and is not given: refused')
  const d = await internal(ctx, 'crud/read hooks --flags layer=runtime')
  t.alike((await read(ctx, PENDING, d.name)).value.form.uri, ['runtime', 'hooks'], 'another layer: by its flag, as anyone names one; allowed, the mrepo\'s own')
  const e = await internal(ctx, 'crud/read .', undefined, { at: ['main', 'swarms/swarm-1'] })
  t.alike((await read(ctx, PENDING, e.name)).value.form.uri, ['main', 'swarms/swarm-1', '.'], 'at a position: the parts before its URI')
  await request(ctx)
  t.alike((await principals(ctx)).map(p => p.id), [a.name], 'one at a time, first come, first served')
})

test('a request waiting for another mrepo\'s answer: collected from its outbox, by the offset it has there; on the principal\'s branch, its key that offset', async (t) => {
  const ctx = await mrepo(t)
  const child = join(ctx.dir, 'mrepos', 'y')
  const { name } = await internal(ctx, 'crud/read y')
  await request(ctx)
  // execute's part, stood in for: sent on, what it waits for said on it
  const there = 1795312345678
  const [p] = await principals(ctx)
  const waiting = { ...p.request, processing: { ...p.request.processing, waiting: { at: 'y', folder: 'mrepos/y', offset: there, resume: false } } }
  await begin(ctx, name, waiting)
  t.alike((await principals(ctx)).map(x => [x.waits, x.response]), [[there, null]], 'waiting: what for, no answer yet')
  await request(ctx)
  t.alike(await layer(ctx, PENDING).list(), [], 'nothing in its outbox yet: nothing collected')
  const answer = returned(asked('crud/read .', { from: 'local/x', to: 'local/y', reply: `/local/x/execute/${name}`, origin: Number(name) }), 'done', 'Read.')
  outboxOf(child).put(there, record('/outbox', answer, there))
  await request(ctx)
  const [n] = await layer(ctx, PENDING).list()
  t.alike(n, undefined, 'collected and, the principal waiting, added to its branch in the same pass')
  const [q] = await principals(ctx)
  t.alike([q.waits, isReturned(q.response), q.response.returned.message], [there, true, 'Read.'], 'the answer beside its principal')
  await request(ctx)
  t.alike((await principals(ctx)).length, 1, 'not collected twice')
  // an answer nobody waits for: kept, in done
  const stray = await admit(ctx, { ...answer, reply: '/local/x/execute/1700000000000' }, { origin: 'internal', key: '5' })
  const busy = await principals(ctx)
  t.ok(busy.some(x => x.response), 'the principal with its answer: being processed, the queue waits')
  t.alike(await layer(ctx, PENDING).list(), [stray.name])
})
