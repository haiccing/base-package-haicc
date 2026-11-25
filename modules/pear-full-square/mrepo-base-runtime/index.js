// mrepo-base-runtime: a running mycelium repository's runtime (the
// framework: the process that runs its protocols, the store's one writer), as a library
// (runtime.js is its command line, base-package-mrepo's entry).
//   run({ repo })           the runtime, in this process, for the mrepo at
//                           an mrepo's directory (<work>/mrepos/<name>: the
//                           filesystem storage; its socket <repo>/runtime.sock:
//                           several in one work folder). ask, start, open take
//                           { repo } the same way.
//   run({ work })           the runtime, in this process: its repository
//                           opened by the setting beside it (<work>/mrepo.json,
//                           mrepo-base-request's `setting`): on native git
//                           (`git`: <work>/mrepos/<name>/.git, mycelium-git's
//                           native backend), on p2p-git with every layer on
//                           the filesystem (`filesystem`: the same folder, no Corestore; the
//                           boot mrepo), or on the p2p layer (`p2p`, the
//                           default: the store, <work>/store, held as its
//                           single writer, the host's repository `host` over
//                           it and its disk side); the local
//                           connection served (<work>/runtime.sock, owner
//                           only: one JSON request a line, one JSON answer a
//                           line: { op: 'status' }, { op: 'stop' }); the
//                           protocols fired in turn, a pass, when something
//                           arrives (the inbox folder and the outbox folders
//                           of linked mrepos a request waits for, watched),
//                           at once after a pass that moved something, and
//                           after a slow look (idle), over their
//                           data states: on the p2p host the inbox folder's
//                           new files committed (the folder the inbox layer's
//                           working tree), the request
//                           protocol (mrepo-base-request), the execute
//                           protocol (mrepo-base-execute), each given the
//                           context (read access, the writer); a pass that
//                           fails: its error in the request executing
//                           (stderr when none is, or that fails too); stops
//                           on `stop`, SIGTERM or SIGINT, closing the store,
//                           (it runs until then: its parent's teardown stops
//                           it). Resolves when it has stopped.
//   start({ work, bare })   the runtime started as its own process, through
//                           the shell (it outlives the caller), from the
//                           deployed bundle; resolves its first status, or
//                           null if it did not answer.
//   ask({ work, op })       one request over the local connection; its
//                           answer, or null if nothing answers.
//   stop({ repo, pid })     the runtime ended, waited for until its process
//                           has ended: asked over its connection, then
//                           SIGTERM, then SIGKILL; { pid, how }, null when
//                           none was running; throws when it did not end.
//   viewOf(work, name)      a repository's folder, <work>/mrepos/<name>
import process from 'bare-process'
import Pipe from 'bare-pipe'
import { spawnSync } from 'bare-subprocess'
import fs, { existsSync, rmSync, writeFileSync } from 'bare-fs'
import { join, dirname, basename } from 'bare-path'
import os from 'bare-os'
import crypto from 'bare-crypto'
import { openStore } from 'p2p-store'
import { mrepos } from 'p2p-mrepo'
import { openRepo, writer } from 'mycelium-git'
import { nativeBackend, p2pgitBackend } from 'mycelium-git'
import { INBOX, OUTBOX, MREPOS, inboxFolder, inboxOf, post, viewOf, gitdirOf, setting, request, principals, layer, internal, hookOf, parse, runLines, DONE, OUTSIDE, nameOf, tick, drop, wrap, checkpoint } from 'mrepo-base-request'
import { execute, failed, XPATH_LOG } from 'mrepo-base-execute'
import { IDENTITY } from 'mrepo-base-xpath'
export { run as runtimeRun } from './external/run/index.js'
export { lay as runtimeLay } from './external/lay/index.js'
export { start as runtimeStart } from './external/start/index.js'
export { stop as runtimeStop } from './external/stop/index.js'
export { programAt, stateOf as programState, launch as launchProgram, end as endProgram } from './internal/program/index.js'
import { pathToFileURL } from 'bare-url'
import pkg from './package.json' with { type: 'json' }

// A pass running longer than this is said: the step it is at (stall).
const STALL = 60000

// How many passes the xpath layer's log may wait for its checkpoint while the runtime is busy.
export const CHECKPOINT = 100
export { INBOX, OUTBOX, inboxFolder, viewOf, gitdirOf, setting }

export const version = { name: pkg.name, version: pkg.version }
export const HOST = 'host'
export const SOCKET = 'runtime.sock'
export const bundleOf = work => join(viewOf(work, setting(work).name), 'packages', 'haiccing', 'base-package-mrepo.bundle')

// An mrepo's socket: <dir>/runtime.sock, when the path fits a Unix socket's
// (about 107 bytes; children nest inside their parents); else a short path in
// the system's temporary folder, named by the directory's hash (the same for
// every process that asks).
export function socketIn (dir) {
  const inside = join(dir, SOCKET)
  if (Buffer.byteLength(inside) <= 100) return inside
  return join(os.tmpdir(), `mrepo-${crypto.createHash('sha256').update(dir).digest('hex').slice(0, 16)}.sock`)
}

// Which repository: by an mrepo's directory (repo: <work>/mrepos/<name>,
// on the filesystem storage, its socket inside it: several in one work
// folder), or by the work folder's setting (<work>/mrepo.json; its socket
// <work>/runtime.sock).
export function whereOf (at) {
  const { work, repo } = typeof at === 'string' ? { work: at } : at
  // dir: the mrepo's own folder (its .git, inbox, packages); work: where
  // its store and Bare are reached (the work folder; for an mrepo by its
  // directory, the parent of the nearest mrepos/ above it: it is
  // <work>/mrepos/<name>, or <work>/mrepos/<unique URI>, placed by its
  // unique URI, a path; else none: reached through its packages manifest)
  if (repo) {
    let up = dirname(repo)
    while (basename(up) !== MREPOS && dirname(up) !== up) up = dirname(up)
    const work = basename(up) === MREPOS ? dirname(up) : null
    return { dir: repo, work, name: basename(repo), storage: 'filesystem', socket: socketIn(repo) }
  }
  const s = setting(work)
  return { dir: viewOf(work, s.name), work, ...s, socket: join(work, SOCKET) }
}

// The repository, opened: { name, id, key, backend, close }. at: the work
// folder, or { repo } (an mrepo's directory).
export async function open (at) {
  const { dir, storage, name } = whereOf(at)
  const work = whereOf(at).work
  if (storage === 'git') {
    const backend = nativeBackend(join(dir, '.git'))
    return { name, id: null, key: null, storage, backend, close: async () => {} }
  }
  if (storage === 'filesystem') {
    const backend = p2pgitBackend(join(dir, '.git'), { fs })
    return { name, id: null, key: null, storage, backend, close: async () => {} }
  }
  const store = await openStore({ storage: join(work, 'store') })
  const repo = await mrepos({ store, local: join(work, 'mrepos') }).open(name)
  return { name: repo.name, id: repo.id, key: repo.key, storage, backend: repo.backend, close: () => store.close() }
}

const socketOf = at => whereOf(at).socket

// The actions the mrepo's linked packages offer (their protocol entry), by
// protocol: from its packages layer's list, each bundle in its packages/.
export async function protocolsOf (repo, folder, skip = null) {
  const listed = await repo.read('/packages/manifest.json').then(b => JSON.parse(b.toString()).packages || {}, () => ({}))
  const actions = {}
  const protocols = {}
  for (const [pkg, p] of Object.entries(listed)) {
    if (!(p.entries || []).includes('protocol') || pkg === skip) continue
    const bundle = join(folder, `${pkg}.bundle`)
    if (!existsSync(bundle)) throw new Error(`a linked package missing: ${bundle}`)
    // its dispatcher: run('/protocol') (imported, nothing else runs)
    const offered = await (await import(pathToFileURL(bundle).href)).run('/protocol')
    for (const [protocol, fns] of Object.entries(offered.actions || {})) actions[protocol] = { ...actions[protocol], ...fns }
    for (const [protocol, cfg] of Object.entries(offered.protocols || {})) protocols[protocol] = cfg
  }
  return { actions, protocols }
}

// own: { pkg, actions, protocols }, the protocols of the package this
// runtime runs from (its protocol.js, passed by its run.js: not imported
// again here): their actions and their configs.
export async function run ({ work: w, repo: given = null, every = 200, idle = 2000, own = null }) {
  const at = given ? { repo: given } : { work: w }
  const { work, dir } = whereOf(at)
  const repo = await open(at)
  const started = new Date().toISOString()
  // No log of its own: what happens to a request is in its document and the
  // commits that moved it.
  const ctx = { work, dir, name: repo.name, backend: repo.backend, repo: openRepo(repo.backend), writer: writer(repo.backend), seen: {} }
  // Its unique URI (<swarm>/<node>, a path), from its runtime layer; its name where
  // it has none: how it is addressed (its inbox's topic, its requests').
  ctx.uri = await ctx.repo.read(IDENTITY).then(b => JSON.parse(b.toString()).uri, () => null) ?? repo.name
  // A record into its own inbox, as its storage takes one: the inbox layer
  // straight on git, the inbox folder otherwise (taken in from there).
  // A line of a hook or a script, as the mrepo's own: queued here, placed by
  // the runtime's next pass as an internal request (standing at main, as a
  // line is written), its completed form waited for in request/done.
  ctx.queued = []
  // Its clock: the offsets of what arrives, its own requests' too: its
  // inbox folder's (the one every sender takes); on git alone, its own.
  ctx.offset = repo.storage === 'git' ? () => tick() : () => inboxOf(dir ?? viewOf(work, repo.name)).reserve()
  ctx.own = parts => new Promise((resolve, reject) => {
    const name = nameOf(ctx.offset())
    ctx.queued.push({ name, parts })
    wake()
    // catch: not in done yet: looked at again
    const look = () => layer(ctx, DONE).read(name).then(done => resolve(done.value.value), () => setTimeout(look, 30))
    setTimeout(look, 30)
  })
  // a request's completed form, from its outbox layer: null until it is there
  // catch: not in the outbox yet: none
  ctx.answer = offset => layer(ctx, 'outbox').read(nameOf(offset)).then(out => out.value.value, () => null)
  // (a core record, no offset yet: given as it arrives; -> its offset)
  ctx.submit = async core => {
    let offset
    if (repo.storage === 'git') { offset = ctx.offset(); await post(ctx, wrap(`/${ctx.uri}/inbox`, { ...core, offset })) } else offset = drop(dir ?? viewOf(work, repo.name), ctx.uri, core)
    wake()
    return offset
  }
  // The protocols its packages offer: each linked package with a protocol
  // entry, loaded from its bundle in the mrepo's packages/ (its dispatcher's
  // run('/protocol')), its actions beside the framework's.
  // No protocol of its own built in: its own package's (own: base-package-
  // runtime's runtime), and those of the packages linked. All are loaded
  // here, at boot; which are open to the outside is another matter (the
  // active ones: protocol/activate, from the hooks). Their configs kept
  // beside the actions: what the check reads (ctx.protocols).
  const loaded = await protocolsOf(ctx.repo, join(dir, 'packages'), own?.pkg)
  const actions = { ...(own?.actions ?? {}), ...loaded.actions }
  ctx.protocols = { ...(own?.protocols ?? {}), ...loaded.protocols }
  // Boot: the protocol protocol opened by the runtime itself, its own
  // request (internal, straight to the handler); then its boot hook file
  // (/runtime/hooks/boot.haicc, its defining package's) run through its
  // own inbox, a request a line: meanwhile only its own requests are taken
  // in (intake 'internal', tagged by the trigger), the rest wait in the
  // inbox until the boot is done. Otherwise the runtime names no protocol:
  // what is activated, extracted or made ready at boot is the hook's.
  const starting = [(await internal(ctx, { command: ['protocol/activate', '.', 'protocol'] })).name]
  const boot = await hookOf(ctx.repo, 'boot')
  // Its commission: what the mrepo does once deployed, after its boot: its
  // components deployed (each commissioned by its own), its service
  // initialised, started, as its package says. At every start: a runtime
  // started again (a replica's, with its container; a restart) runs it
  // again, and its lines, idempotent, do again only what is not done (a
  // deploy of what is there: a warning). Its state in the status, which
  // the deploy waits on: none (no hook), pending, running, done, failed
  // (the line that failed, why).
  const commission = await hookOf(ctx.repo, 'commission')
  ctx.commission = { state: commission === null ? 'none' : 'pending' }
  const commissioning = () => {
    if (commission === null) return
    ctx.commission = { state: 'running' }
    // catch: a line that failed is in its own record and in the state; the runtime goes on
    Promise.resolve().then(() => runLines({ dir: dir ?? viewOf(work, repo.name), uri: ctx.uri, own: ctx.own }, parse(commission), '.'))
      .then(() => { ctx.commission = { state: 'done' }; wake() }, err => { ctx.commission = { state: 'failed', error: err.message } })
  }
  // Its decommission, asked by a teardown before the runtime is stopped:
  // what the mrepo does before it goes (what it deployed torn down). ->
  // { ok, decommission: none | done } or { ok: false, error }
  const decommissioning = async () => {
    const hook = await hookOf(ctx.repo, 'decommission')
    if (hook === null) return { ok: true, decommission: 'none' }
    try {
      await runLines({ dir: dir ?? viewOf(work, repo.name), uri: ctx.uri, own: ctx.own }, parse(hook), '.')
      return { ok: true, decommission: 'done' }
    } catch (err) { return { ok: false, error: `decommission: ${err.message}` } }
  }
  ctx.intake = false
  const status = () => ({ ok: true, pid: process.pid, started, repository: { name: repo.name, uri: ctx.uri, storage: repo.storage, id: repo.id, key: repo.key }, commission: { state: ctx.commission.state, ...(ctx.commission.error ? { error: ctx.commission.error } : {}) }, version })
  let stopping = null
  let stopped = false
  let server = null
  const stop = why => (stopping ??= (async () => {
    // No new connections; open ones end with the process (not waited on:
    // the one that asked to stop may still be open).
    if (server) server.close()
    clearTimeout(timer)
    clearInterval(stall)
    for (const [, watcher] of watched) watcher.close()
    watched.clear()
    while (busy) await new Promise(resolve => setTimeout(resolve, 20))
    await repo.close()
    // The socket last (the store's lock itself is released as the process ends).
    rmSync(socketOf(at), { force: true })
    stopped = true
  })())
  rmSync(socketOf(at), { force: true }) // a socket left by a runtime that ended without stopping: the store's lock says none runs now
  server = Pipe.createServer(pipe => {
    let buf = ''
    pipe.on('data', chunk => {
      buf += chunk.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1)
        let req = null
        // catch: not a request on the socket: answered as none
        try { req = JSON.parse(line) } catch {}
        if (req?.op === 'status') pipe.write(JSON.stringify(status()) + '\n')
        else if (req?.op === 'stop') { pipe.end(JSON.stringify({ ok: true, stopping: true }) + '\n'); stop('asked') }
        else if (req?.op === 'decommission') decommissioning().then(r => pipe.write(JSON.stringify(r) + '\n'))
        else pipe.write(JSON.stringify({ ok: false, error: 'not a request (status, stop, decommission)' }) + '\n')
      }
    })
    pipe.on('error', () => {})
  })
  server.listen({ path: socketOf(at), ownerOnly: true })
  // A pass: the protocols fired in turn, never two at once. Then the next
  // one, not on a clock: at once when this one moved something (a branch's
  // head changed: there may be more to do); else when something arrives:
  // a file in the inbox folder, or in the outbox folder of a linked mrepo a
  // request here waits for (the folders watched); and after a slow look
  // (idle), the net for an event missed. A folder that cannot be watched
  // (not there yet), and a repository whose inbox is no folder here (git
  // storage: its inbox layer written by others), are looked at as before,
  // every `every`.
  let busy = false
  let again = false
  // where the pass is, and since when: a pass that runs on too long is said
  // (stall, below)
  let stage = null
  let since = 0
  let timer = null
  let due = Infinity
  const watched = new Map()
  const wake = (ms = 0) => {
    if (stopping) return
    if (busy) { again = true; return }
    const at = Date.now() + ms
    if (timer && at >= due) return
    clearTimeout(timer)
    due = at
    timer = setTimeout(pass, ms)
  }
  // The folders watched now: those given, and no others. -> whether each
  // is watched, and whether one was added (what came before it was is
  // looked for once more).
  const watch = folders => {
    for (const [folder, watcher] of watched) if (!folders.includes(folder)) { watcher.close(); watched.delete(folder) }
    let added = false
    for (const folder of folders) {
      if (watched.has(folder) || !existsSync(folder)) continue
      // catch: a folder that cannot be watched is looked at instead: every `every`
      try { const watcher = fs.watch(folder, () => wake()); watcher.on('error', () => {}); watched.set(folder, watcher); added = true } catch {}
    }
    return { all: folders.every(f => watched.has(f)), added }
  }
  const inbox = repo.storage !== 'git' ? join(dir ?? viewOf(work, repo.name), 'inbox') : null
  const heads = async () => (await repo.backend.listBranches()).map(([b, c]) => `${b} ${c}`).sort().join('\n')
  let booting = false
  // (passes since the xpath layer's log was last committed)
  let sinceCheckpoint = 0
  async function pass () {
    timer = null
    due = Infinity
    if (stopping || busy) return
    busy = true
    again = false
    since = Date.now()
    let next = every
    try {
      stage = 'heads'
      const before = await heads()
      stage = 'post'
      if (repo.storage !== 'git') await post(ctx)
      stage = 'intake'
      // operational once its own requests are done: the inbox taken in
      // catch: not in done yet: its own requests still going, not operational yet
      if (ctx.intake === false && !booting && (await Promise.all(starting.map(n => layer(ctx, DONE).read(n).then(() => true, () => false)))).every(Boolean)) {
        if (boot === null) { ctx.intake = true; commissioning() } else {
          booting = true
          // the boot hook's lines, each its own request; whatever came of
          // them, the inbox open after
          // catch: a line that failed is in its own record; the boot goes on
          Promise.resolve().then(() => runLines({ dir: dir ?? viewOf(work, repo.name), uri: ctx.uri, own: ctx.own }, parse(boot), '.')).catch(() => null).then(() => { ctx.intake = true; commissioning(); wake() })
        }
      }
      // the lines queued as the mrepo's own: placed now, between passes
      stage = 'own'
      for (const q of ctx.queued.splice(0)) await internal(ctx, { command: q.parts }, q.name, { at: OUTSIDE })
      stage = 'request'
      await request(ctx)
      stage = 'execute'
      await execute(ctx, { actions })
      stage = 'request again'
      await request(ctx)
      // The xpath layer's log: its folder's new records committed, a
      // checkpoint, apart from any request: when nothing else moved (the
      // runtime idle), and at least every CHECKPOINT passes while it is
      // busy. On the filesystem storage, where the layer is there.
      stage = 'checkpoint'
      const moved = (await heads()) !== before
      if (repo.storage !== 'git' && (!moved || ++sinceCheckpoint >= CHECKPOINT) && before.includes(`${XPATH_LOG} `)) { sinceCheckpoint = 0; await checkpoint(ctx, XPATH_LOG) }
      stage = 'heads again'
      if ((await heads()) !== before || !ctx.intake) next = ctx.intake ? 0 : Math.min(every, 20)
      else if (inbox) {
        // nothing moved: wait for what arrives: the inbox, and the answers
        // the requests waiting here wait for
        stage = 'waiting'
        const waiting = dir ? (await principals(ctx)).filter(p => p.waits && !p.response && p.core.value?.remote?.folder).map(p => join(dir, p.core.value.remote.folder, 'outbox')) : []
        const { all, added } = watch([inbox, ...new Set(waiting)])
        next = added ? 0 : all ? idle : every
      }
    } catch (err) {
      // The error in the request executing; none, or that failing too: stderr.
      stage = 'failed'
      const why = `runtime: ${err.message}`
      // console: the runtime's last word: a pass failed and no request was executing to take it, or it could not be recorded
      try { if (!(await failed(ctx, why)).length) console.error(`mrepo: ${why}`) } catch (e) { console.error(`mrepo: ${why}; not recorded: ${e.message}`) }
    } finally { busy = false; stage = null }
    wake(again ? 0 : next)
  }
  // A pass that runs on past STALL: said once, on stderr and in the mrepo's
  // folder (runtime-stall.json: the step it is at, since when), so a
  // runtime that stops taking its inbox in says where it stopped.
  let said = 0
  const stall = setInterval(() => {
    if (!busy || Date.now() - since < STALL || said === since) return
    said = since
    const report = { pid: process.pid, stage, since: new Date(since).toISOString(), seconds: Math.round((Date.now() - since) / 1000) }
    // console: the runtime's own warning: a pass stalled (also written beside it, when it has a folder)
    console.error(`mrepo: a pass stalled: ${JSON.stringify(report)}`)
    // catch: no folder of its own to write into: said on stderr only
    try { if (dir) writeFileSync(join(dir, 'runtime-stall.json'), JSON.stringify(report, null, 2) + '\n') } catch {}
  }, STALL / 4)
  if (inbox) watch([inbox])
  wake()
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
  // Held open until it has stopped (the timer keeps the process alive).
  await new Promise(resolve => { const t = setInterval(() => { if (stopped) { clearInterval(t); resolve() } }, 100) })
}

export function ask ({ work, repo = null, op, timeout = 5000 }) {
  const at = repo ? { repo } : { work }
  return new Promise(resolve => {
    if (!existsSync(socketOf(at))) return resolve(null)
    let buf = ''
    let done = false
    const finish = v => { if (done) return; done = true; clearTimeout(t); pipe.destroy(); resolve(v) }
    const t = setTimeout(() => finish(null), timeout)
    const pipe = new Pipe(socketOf(at))
    pipe.on('data', chunk => {
      buf += chunk.toString()
      const i = buf.indexOf('\n')
      // catch: not an answer: null, as no answer
      if (i >= 0) { let v = null; try { v = JSON.parse(buf.slice(0, i)) } catch {} finish(v) }
    })
    pipe.on('error', () => finish(null))
    pipe.on('close', () => finish(null))
    pipe.write(JSON.stringify({ op }) + '\n')
  })
}

// commissioned({ repo }): an mrepo's commission waited for, as its status
// says it: until it is done or failed, or its runtime is gone. A deploy
// waits on it. -> { state: none | done | failed, error } ; null: no runtime
// answering. wait: the bound, in ms (a solution's commission deploys its
// components: minutes).
export async function commissioned ({ work, repo = null, wait = 30 * 60 * 1000 }) {
  for (const end = Date.now() + wait; ;) {
    const s = await ask({ work, repo, op: 'status', timeout: 2000 })
    if (!s) return null
    const c = s.commission ?? { state: 'none' }
    if (c.state !== 'pending' && c.state !== 'running') return c
    if (Date.now() >= end) return { state: 'failed', error: `not done in ${Math.round(wait / 1000)} s` }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

// decommission({ repo }): an mrepo asked to decommission, its hook's lines
// run by its runtime, waited for: what a teardown does before it stops it.
// -> { ok, decommission: none | done } or { ok: false, error }; null: no
// runtime answering.
export const decommission = ({ work, repo = null, wait = 30 * 60 * 1000 }) => ask({ work, repo, op: 'decommission', timeout: wait })

// start({ repo, bundle }): an mrepo's runtime by its directory, from a
// runtime package's bundle (its entry takes the directory).
export async function start ({ work, repo = null, bare = process.execPath, bundle = repo ? join(repo, 'packages', 'haiccing', 'base-package-runtime.bundle') : bundleOf(work), wait = 10000 }) {
  const args = repo ? [bundle, repo] : [bundle, 'start', `--work=${work}`]
  const already = await ask({ work, repo, op: 'status' })
  if (already) return already
  // Started by the shell, in the background (its own session where setsid is
  // there), the shell ending at once: the runtime is not this process's
  // child, so this process ending leaves it running (bare-subprocess sends
  // SIGTERM to its own children still running when it exits).
  const r = spawnSync('sh', ['-c', 'if command -v setsid >/dev/null 2>&1; then setsid "$@" </dev/null >/dev/null 2>&1 & else "$@" </dev/null >/dev/null 2>&1 & fi', 'sh', bare, ...args], { stdio: 'ignore' })
  if (r.status !== 0) return null
  for (const end = Date.now() + wait; Date.now() < end;) {
    await new Promise(resolve => setTimeout(resolve, 200))
    const s = await ask({ work, repo, op: 'status', timeout: 1000 })
    if (s) return s
  }
  return null
}

// stop({ repo, pid }): an mrepo's runtime ended, by its directory (or
// { work }). Waited for until its process has ended, not only until it
// stops answering: asked over its connection; still there, SIGTERM; still
// there, SIGKILL. pid: its process where it does not answer (as whoever
// started it recorded it). -> { pid, how } (how: asked, SIGTERM, SIGKILL);
// null when none was running; throws when it did not end.
// catch: no such process: not alive
const alive = pid => { try { os.kill(pid, 0); return true } catch { return false } }
const ended = async (pid, ms) => { for (let i = 0; i < ms / 100 && alive(pid); i++) await new Promise(resolve => setTimeout(resolve, 100)); return !alive(pid) }
export async function stop ({ work, repo = null, pid = null }) {
  const was = await ask({ work, repo, op: 'status' })
  pid = was?.pid ?? pid
  if (!pid || !alive(pid)) return null
  if (was) await ask({ work, repo, op: 'stop' })
  if (await ended(pid, 5000)) return { pid, how: 'asked' }
  // catch: ended meanwhile: nothing to signal
  try { os.kill(pid, 'SIGTERM') } catch {}
  if (await ended(pid, 5000)) return { pid, how: 'SIGTERM' }
  // catch: ended meanwhile: nothing to signal
  try { os.kill(pid, 'SIGKILL') } catch {}
  if (await ended(pid, 2000)) return { pid, how: 'SIGKILL' }
  throw new Error(`its runtime did not stop: pid ${pid}`)
}
