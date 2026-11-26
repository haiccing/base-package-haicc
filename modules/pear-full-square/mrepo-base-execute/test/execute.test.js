import test from 'brittle'
import fs, { mkdtempSync, rmSync, mkdirSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { p2pgitBackend, openRepo, writer } from 'mycelium-git'
import { request, internal, principals, ensure, drop, post, layer, record, asked, returned, outboxOf, inboxOf, nameOf, AUTHOR, PENDING, EXECUTE, DONE, NONE } from 'mrepo-base-request'
import { execute, executed, failed, branchOf, LISTED } from '../index.js'

// Actions as a package would offer them, each saying what happened.
const leaf = uri => uri.at(-1).split('/').pop()
const actions = {
  note: {
    // a document written; with `twice`, in two local commits, the second undone
    put: async (exec, { uri, args: [text, how] }) => {
      exec.put(`main/${leaf(uri)}.txt`, Buffer.from(text))
      if (how === 'twice') { await exec.commit('first'); exec.put('main/second.txt', Buffer.from('x')); await exec.commit('second'); await exec.rollback() }
      exec.log('verbose', 'written', `Wrote ${leaf(uri)}.txt.`)
      return `Wrote ${leaf(uri)}.txt in main.`
    },
    get: async (exec, { uri }) => {
      const bytes = await exec.step('read', b => `Read ${leaf(uri)}.txt, ${b.length} bytes.`, () => exec.read(`main/${leaf(uri)}.txt`))
      exec.log('debug', 'bytes', `Its text: ${bytes}.`)
      return { message: `Read ${leaf(uri)}.txt.`, attachments: [{ name: 'the document', type: 'haiccing/base-package-note/text', at: `main/${leaf(uri)}.txt` }] }
    },
    many: async (exec) => { for (let i = 0; i <= LISTED; i++) exec.put(`main/many/${String(i).padStart(3, '0')}.txt`, Buffer.from('x')); return 'Wrote them.' },
    break: async (exec) => { exec.put('main/never.txt', Buffer.from('x')); await exec.commit(); throw new Error('the note cannot be written', { cause: new Error('no ink') }) },
    quiet: async () => null,
    old: async (exec) => { exec.log('info', 'old', { data: 1 }); return 'Said.' },
    // a command run in this execution, its answer its own
    both: async (exec, { args }) => { const r = await exec.run(args); exec.continuation('haicc . note/get a\n'); return `Ran it. It said: ${r.message}` },
    // sent on to the mrepo linked at y
    there: async (exec, { args }) => exec.forward({ at: 'y', mrepo: 'local/y', folder: 'mrepos/y', dir: join(exec.runtime.dir, 'mrepos', 'y') }, args),
    // a job waited for, then said
    later: async (exec, { args: [how] }) => {
      if (exec.resumed) return exec.resumed.status === 'failed' ? `The job failed: ${exec.resumed.message}` : `The job ended. ${exec.resumed.message}`
      return exec.wait(async () => { if (how === 'badly') throw new Error('it broke'); return 'Three files copied.' })
    }
  }
}
const config = { uris: ['**'] }
// (both, there: commands that pass their words on)
const protocols = { note: { default: 'get', actions: Object.fromEntries(Object.keys(actions.note).map(a => [a, ['both', 'there'].includes(a) ? { ...config, command: true } : config])) } }
const registry = { valid: () => ({ valid: true }) }

async function mrepo (t, name = 'x') {
  const work = mkdtempSync(join(tmpdir(), 'execute-'))
  t.teardown(() => rmSync(work, { recursive: true, force: true }))
  const dir = join(work, 'mrepos', 'local', name)
  const backend = p2pgitBackend(join(dir, '.git'), { fs })
  await backend.init()
  const ctx = { work, dir, name, uri: `local/${name}`, backend, repo: openRepo(backend), writer: writer(backend), protocols, registry }
  for (const b of [PENDING, EXECUTE, DONE]) await ensure(ctx, b)
  for (const b of ['main', 'protocols']) await ctx.writer.createLayer(b, `Create ${b}`, { author: AUTHOR })
  return ctx
}
const heads = async ctx => Object.fromEntries(await ctx.backend.listBranches())
const pass = async ctx => { await post(ctx); await request(ctx); await execute(ctx, { actions }); await request(ctx) }
// the mrepo's own: placed, executed, read from done
const own = async (ctx, line) => { const { name } = await internal(ctx, line); await pass(ctx); return (await layer(ctx, DONE).read(name)).value }
const lines = r => r.processing.log.map(e => [e.level, e.event, e.line.replace(/\d+ ms/g, 'N ms')])

test('execute: its action run on its own branches, squashed into each target; the request returned, done, with what the action says', async (t) => {
  const ctx = await mrepo(t)
  const before = (await heads(ctx)).main
  const r = await own(ctx, 'note/put a hello')
  t.alike(r.returned, { status: 'done', message: 'Wrote a.txt in main.', attachments: [] }, 'what the action says, its own words')
  t.is((await ctx.repo.read('/main/a.txt')).toString(), 'hello', 'in main')
  const squashed = await ctx.backend.readCommit((await heads(ctx)).main)
  t.alike(squashed.parents, [before], 'one commit in main, its only parent main as it was')
  t.ok(/: note put main\/a/.test(squashed.message), 'saying the request')
  t.alike(Object.keys(await heads(ctx)).filter(b => b.startsWith('execute/')), [], 'its execution branches squashed and removed')
  t.alike(r.processing.changed, [{ target: 'main', added: ['a.txt'], changed: [], removed: [] }], 'what it changed: a field, a target each')
  t.alike([r.processing.metrics.puts, r.processing.metrics.commits, r.processing.metrics.ms >= 0], [1, 1, true], 'its metrics: a field')
  t.alike(lines(r), [], 'at info nothing said beside them: a fact once')
  const twice = await own(ctx, 'note/put b hello twice')
  t.alike([twice.returned.status, twice.processing.changed], ['done', [{ target: 'main', added: ['b.txt'], changed: [], removed: [] }]], 'a local commit undone in the action: not in the target')
  const got = await own(ctx, 'note/get a --flags log=debug')
  t.alike(got.returned, { status: 'done', message: 'Read a.txt.', attachments: [{ name: 'the document', type: 'haiccing/base-package-note/text', at: 'main/a.txt' }] }, 'data its product: attached, by its type, where it is')
  t.alike(lines(got), [['verbose', 'note.get.read', 'Read a.txt, 5 bytes. (N ms; 1 read)'], ['debug', 'note.get.bytes', 'Its text: hello.']], 'its log as much as its flag asks: the action\'s entries under its name, a step measured behind its line')
  const many = await own(ctx, 'note/many .')
  t.alike([many.processing.changed[0].added.length, lines(many)], [LISTED, [['info', 'request.changed', `${LISTED + 1} paths changed in main: the first ${LISTED} listed.`]]], 'more than it lists of a target: said')
})

test('failed: what stopped it said, its causes; nothing of it kept; an action that says nothing, one that logs data', async (t) => {
  const ctx = await mrepo(t)
  const before = (await heads(ctx)).main
  const r = await own(ctx, 'note/break .')
  t.alike(r.returned, { status: 'failed', message: 'Failed, nothing of it kept.\nthe note cannot be written\ncaused by: no ink', attachments: [] }, 'the outcome first, then why, a fact a line')
  t.alike(lines(r), [['error', 'request.failed', 'the note cannot be written.\nCaused by: no ink.\nUndone: 1 commit, 1 put.']], 'in its log: what was undone')
  t.is((await heads(ctx)).main, before, 'main untouched')
  t.alike([r.processing.changed, r.processing.metrics.puts], [[], 1], 'nothing changed; its metrics still its own')
  t.alike((await own(ctx, 'note/quiet .')).returned.message, 'Failed, nothing of it kept.\nnothing said: note/quiet answers with what happened, in words', 'an action says what happened')
  t.alike((await own(ctx, 'note/old .')).returned.message, 'Failed, nothing of it kept.\nnot a log entry: note.old.old (what happened, said: a line)', 'a log entry is a line')
  t.alike((await own(ctx, 'note/nope .')).returned.message, 'Refused, nothing run.\nno action: note nope (both, break, get, later, many, old, put, quiet, there)', 'an action there is none of: refused')
})

test('from the inbox: refused as it executes while its protocol is not active; active: run, sent back', async (t) => {
  const ctx = await mrepo(t)
  const from = { from: 'terminal', reply: '/terminal' }
  const o = drop(ctx.dir, ctx.uri, asked('note/put a hello', from))
  await pass(ctx)
  t.alike(outboxOf(ctx.dir).read(o).value.returned, { status: 'failed', message: 'Refused, nothing run.\nnot now: note put (note is not active)', attachments: [] }, 'queued at the door, refused here: the state as it is now')
  await layer(ctx, 'protocols').put('note', {}, 'Activate note')
  const p = drop(ctx.dir, ctx.uri, asked('note/put a hello', from))
  await pass(ctx)
  const back = outboxOf(ctx.dir).read(p)
  t.alike([back.offset, back.value.command, back.value.returned.status, back.value.returned.message], [p, 'note/put a hello', 'done', 'Wrote a.txt in main.'], 'the same request back, returned')
})

test('a command run in the execution: its answer its own, the flags in force with it; a continuation', async (t) => {
  const ctx = await mrepo(t)
  await own(ctx, 'note/put a hello')
  const r = await own(ctx, 'note/both . --flags log=verbose -- note/get a')
  t.alike([r.returned.status, r.returned.message], ['done', 'Ran it. It said: Read a.txt.'])
  t.alike(lines(r), [['verbose', 'note.get.read', 'Read a.txt, 5 bytes. (N ms; 1 read)']], 'its entries under its own name, as much as the flag in force asks')
  t.alike(r.processing.continuation, { at: '.', script: 'haicc . note/get a\n' }, 'what whoever asked goes on with')
  const bad = await own(ctx, 'note/both . note/get a --flags nope')
  t.alike(bad.returned.message, 'Failed, nothing of it kept.\nnot run: no flag: nope (container, feedback, help, layer, log, physical)', 'what its flags keep from being run: said, as at the door')
})

test('sent on: the command in a request of its own, the flags in force in its line; the principal waiting; returned with the answer, the request it became linked', async (t) => {
  const ctx = await mrepo(t)
  const y = join(ctx.dir, 'mrepos', 'y')
  mkdirSync(join(y, 'inbox'), { recursive: true })
  const { name } = await internal(ctx, 'note/there . --flags log=debug -- note/get a')
  await pass(ctx)
  const [p] = await principals(ctx)
  const [there] = inboxOf(y).list()
  t.alike([p.request.processing.waiting, p.request.processing.sent], [{ at: 'y', folder: 'mrepos/y', offset: there, resume: false }, { at: 'y', mrepo: 'local/y', offset: there }], 'what it waits for, said on it; the request it became, linked')
  const sent = inboxOf(y).read(there)
  t.alike([sent.topic, sent.value.command, sent.value.from, sent.value.to, sent.value.reply, sent.value.origin], ['/local/y/inbox', 'note/get a --flags log=debug --', 'local/x', 'local/y', `/local/x/execute/${name}`, Number(name)], 'asked of the linked mrepo: its line, the flags that hold down a chain written into it; its answer for this request\'s branch')
  t.alike(Object.keys(await heads(ctx)).filter(b => b.startsWith('execute/')), [branchOf(name, EXECUTE)], 'only its request branch left: nothing of it executed here')
  // the linked mrepo's part, stood in for: the request returned, in its outbox
  const answer = { ...returned(sent.value, 'done', 'Read a.txt.'), processing: { ...sent.value.processing, log: [{ time: '2026-11-26T10:00:00.000Z', level: 'debug', event: 'note.get.bytes', line: 'Its text: hello.' }], metrics: { ms: 3, reads: 1, selects: 0, puts: 0, removes: 0, commits: 0 }, path: ['z'], continuation: { at: 'z', script: 'true\n' } } }
  outboxOf(y).put(there, record('/outbox', answer, there))
  await pass(ctx)
  await pass(ctx)
  const r = (await layer(ctx, DONE).read(name)).value
  t.alike(r.returned, answer.returned, 'what was returned there: its own')
  t.alike([r.processing.waiting, r.processing.sent, r.processing.continuation], [null, { at: 'y', mrepo: 'local/y', offset: there }, { at: 'y/z', script: 'true\n' }], 'waiting for nothing; the request it became linked: its mrepo, its offset there; its continuation seen from here')
  t.alike([r.processing.log, r.processing.metrics], [[], null], 'what happened to it there is that request\'s own, in that mrepo\'s request/done: not copied')
})

test('a job waited for: the request parked, the runtime free; resumed with what the job returned', async (t) => {
  const ctx = await mrepo(t)
  for (const [how, said] of [['well', 'The job ended. Three files copied.'], ['badly', 'The job failed: it broke']]) {
    const { name } = await internal(ctx, `note/later . ${how}`)
    await pass(ctx)
    const [p] = await principals(ctx)
    t.alike([p.request.processing.waiting.folder, p.request.processing.waiting.resume], ['waiting', true], `${how}: parked, what it waits for said on it`)
    await new Promise(resolve => setTimeout(resolve, 50))
    await pass(ctx)
    await pass(ctx)
    const r = (await layer(ctx, DONE).read(name)).value
    t.alike([r.returned.status, r.returned.message, r.processing.waiting], ['done', said, null], `${how}: its action run again with what the job returned`)
  }
})

test('executed: a request returned elsewhere handed over as execute hands one; failed: a runtime\'s error in the request executing', async (t) => {
  const ctx = await mrepo(t)
  const a = await internal(ctx, 'note/get a')
  await request(ctx)
  const [p] = await principals(ctx)
  await executed(ctx, a.name, record(`/${EXECUTE}`, returned(p.request, 'done', 'Done elsewhere.'), Number(a.name)))
  await request(ctx)
  t.is((await layer(ctx, DONE).read(a.name)).value.returned.message, 'Done elsewhere.')
  const b = await internal(ctx, 'note/get a')
  await request(ctx)
  t.alike(await failed(ctx, 'the store is closed'), [b.name])
  await request(ctx)
  const r = (await layer(ctx, DONE).read(b.name)).value
  t.alike([r.returned.status, r.returned.message, r.processing.log.map(e => [e.level, e.event, e.line])], ['failed', 'Failed: the runtime\'s pass over it.\nthe store is closed', [['error', 'runtime.failed', 'the store is closed']]])
  t.alike(await failed(ctx, 'again'), [], 'none executing: none')
  t.alike(r.form.flags, NONE)
  t.is(nameOf(Number(b.name)), b.name)
})
