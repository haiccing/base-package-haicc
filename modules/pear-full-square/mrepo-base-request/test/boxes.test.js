import test from 'brittle'
import fs, { mkdtempSync, rmSync, writeFileSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { p2pgitBackend, nativeBackend, openRepo, writer } from 'mycelium-git'
import { post, inboxFolder, layer, record, setting, gitdirOf, isWork, arriving, drop, nameOf, AUTHOR } from '../index.js'

async function ctxOn (work, backend) {
  await backend.init()
  return { work, name: 'host', backend, repo: openRepo(backend), writer: writer(backend) }
}

test('the setting: the p2p host by default; a repository on native git by mrepo.json', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'setting-'))
  try {
    t.alike(setting(work), { storage: 'p2p', name: 'host' })
    t.absent(isWork(work), 'neither store/ nor mrepo.json: not a work folder')
    writeFileSync(join(work, 'mrepo.json'), JSON.stringify({ storage: 'git', name: 'pipeline' }))
    t.alike(setting(work), { storage: 'git', name: 'pipeline' })
    t.ok(isWork(work))
    t.is(gitdirOf(work, 'pipeline'), join(work, 'mrepos', 'pipeline', '.git'))
  } finally { rmSync(work, { recursive: true, force: true }) }
})

for (const engine of ['p2p-git', 'native']) {
  test(`post on ${engine}: a record committed into the inbox layer under its offset; the folder's new records committed; nothing removed`, async (t) => {
    const work = mkdtempSync(join(tmpdir(), 'post-'))
    try {
      const gitdir = join(work, 'mrepos', 'host', '.git')
      const ctx = await ctxOn(work, engine === 'native' ? nativeBackend(gitdir) : p2pgitBackend(gitdir, { fs }))
      const box = () => layer(ctx, 'inbox')
      const a = 1795312345678
      t.alike(await post(ctx, record('/inbox', { a: 1 }, a)), [nameOf(a)], 'a record, its commit added, its name its offset')
      t.alike(await box().list(), ['1795312345678'])
      t.alike((await box().read(nameOf(a))).value, { a: 1 })
      t.ok(await ctx.repo.find('/inbox/17953/179531/1795312345678.json'), 'a streaming layer: in its buckets')
      t.alike(await post(ctx, record('/inbox', { a: 1 }, a)), [], 'the same offset again: nothing')
      const [given] = await post(ctx, record('/inbox', { n: 0 }))
      t.is((await box().read(given)).offset, Number(given), 'a record with no offset: given one, stamped on it')
      // dropped as everyone drops a record: its offset given as it arrives
      const f = drop(join(work, 'mrepos', 'host'), 'host', record('/reply', { b: 2 }))
      const g = drop(join(work, 'mrepos', 'host'), 'host', record('/reply', { c: 3 }))
      t.ok(g > f && f > Number(given), 'offsets only grow, the order they arrived')
      const dropped = inboxFolder(work).read(f)
      t.alike([dropped.topic, dropped.offset, dropped.value.offset, dropped.value.value], ['/host/inbox', f, f, { b: 2 }], 'the offset on the envelope and its core')
      t.alike(await post(ctx), [nameOf(f), nameOf(g)], 'the folder\'s new records, one commit')
      t.alike(await post(ctx), [], 'nothing new: nothing')
      t.alike(await box().list(), [nameOf(a), given, nameOf(f), nameOf(g)])
      t.alike(inboxFolder(work).list({ ascending: true }), [f, g], 'the folder kept (housekeeping later)')
      // made by the runtime: declared as it is made, its structure in its config
      t.alike(JSON.parse((await ctx.repo.read('/inbox/.layer.json')).toString()).structure, { type: 'offset-files', levels: [5, 6], batch: 50 }, 'the inbox, made when first needed: its structure declared in its config')
      t.alike(await arriving(ctx), [nameOf(a), given, nameOf(f), nameOf(g)], 'none taken in yet: first come, first served; read as a topic, ascending')
      // explicit, always: a layer that declares no structure is a folder, whatever its name
      await ctx.writer.createLayer('outbox', 'Create outbox', { author: AUTHOR })
      t.is(await layer(ctx, 'outbox').streaming(), false, 'a box made without a config: a folder, not a stream; no default by its name')
      t.alike(await box().list({ after: given }), [nameOf(f), nameOf(g)], 'past a pointer')
      t.is(await box().has(nameOf(g)), true)
      t.is(await box().has('1795312345679'), false)
    } finally { rmSync(work, { recursive: true, force: true }) }
  })
}

