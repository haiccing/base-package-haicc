// mrepo-base-execute: the execute protocol, base variant. One pass over its
// data state, given the runtime's context ({ name, repo, writer, backend }):
// a request on its own branch of request/execute (a record around it), not
// yet returned:
//   1. checked again against the runtime's data as it is now (the service
//      state may have moved since it was queued); its action run inside the
//      execution context (read-only to it, frozen): it reads a target
//      overlaid by the request's execution branch, writes only its execution
//      branches, and reads the runtime's context through it (exec.runtime:
//      the repository's name, its branches, its protocols, read access),
//      never its writer
//   2. its execution branches its own, by its key: execute/<key>/<target>,
//      each made from its target's head as the request first writes there
//      (main, runtime, help, protocols: those the mrepo has)
//   3. each execution branch squashed into its own target (one commit
//      there, the request's: what it did on its branch, commit by commit,
//      stays out of the target's history), then removed (a failure:
//      removed, nothing squashed)
//   4. the request returned: done, with what its action says and its
//      attachments, or failed, with what stopped it; written in its record
//      through execute/<key>/request/execute, merged into request/execute
//      (the request protocol moves it to done, then starts the next
//      pending)
// An action: fn(exec, form) -> what it says happened, natural language (the
// outcome first, a fact a line, names exact): a text, or { message,
// attachments } where data is its product, each attachment its name, its
// type's URI and its value ({ name, type, value }), or where its value is
// ({ name, type, at }). A value is written as the wrapper, its content the
// value's bytes by its type (mrepo-base-request, lib/attachment.js), by the
// types the mrepo holds (ctx.types), while the request can still fail
// whole: a value that does not fit, a type not held, fails it. An answer
// handed to an action (exec.run, exec.resumed) has its attachments as
// values; one passed on untouched (a command sent on) is not converted.
// One that says nothing fails its request. What it throws fails it: its
// message what is said.
// executed(ctx, name, record): step 4 alone, a request returned elsewhere
// (the boot's own) handed over the same way; a runtime running on the
// repository may merge it first: found done then.
// failed(ctx, why): a runtime's pass that failed, said in the request
// executing (returned failed); the names returned ([]: none was executing).
// A request is processed on its own branch of request/execute (begun there
// by the request protocol, straight from pending), which only ever adds: its
// principal, what it waits for, a child's answer, its completion; merged
// into request/execute then, and removed.
// A command sent on (lib/remote.js): an action that finds its position a
// shortcut sends the command that follows to the mrepo linked there
// (exec.forward). The request's processing ends there: what it waits for is
// said on it (processing.waiting); a request branch not being processed has
// a waiting principal. The request protocol adds the child's answer to the
// branch; the principal is then returned with it here: what was returned
// there its own. What happened to it there is not copied: the request it
// became is linked (processing.sent: the mrepo, its offset there), found
// in that mrepo's request/done.
// A command executed here (exec.run): understood, checked as this request
// is, its action run in this same execution. Its URI is read as written
// where it stands: at main, or at the position a haicc command went to.
// A request's URI is an array of segments, a prefix then the URI as
// written (['main', 'host']); the paths the execution reads and writes by
// are given relative from the root (main/x) or slash-led (/main/x), the
// same.
// What happened to the request on its way (its processing), made here, at
// the boundary, for every request, whatever its action does. A fact once:
// what has a field is not said in a line beside it.
//   metrics   how long it took, what it read and wrote (ms, reads,
//             selects, puts, removes, commits)
//   changed   what it changed, a target each: the paths added, changed,
//             removed (at most LISTED of a target; beyond: said in its log)
//   waiting   what it waits for, sent on or parked; sent, the request it
//             became where it was sent on, a link
//   log       its entries, a line each ({ time, level, event, line }):
//             verbose: the action's steps, debug its internals: the
//             action's own entries (exec.log), under its protocol and
//             action (crud.read.<event>); and at debug this boundary's own
//             steps (train.<event>, each with what it took); error: what
//             stopped it (request.failed: the error, the step it was at,
//             what was undone; its stack at debug); always kept
// How much of the log is kept is the request's flag, log=info|verbose|debug
// (info without it). A flag holds through a chain until changed: a command
// run here (exec.run) can set it from there on, one sent on takes the flags
// in force with it, written into its line; the entries of the request it
// became are that request's own, there.
import { record, continuationOf, logger, sorted, AUTHOR, EXECUTE, check, runtimeData, isInternal, principals, asked, understood, measured, returned, isReturned, refusal, carrying, words, lineOf, joined, slashed, STANDING, wrapped, opened, handed } from 'mrepo-base-request'


// The XPath machinery's own layers, and its log of physical queries there
// (xpath's names; its log is written again when xpath is brought to the
// request: a step's line holds no query to keep).
export const XPATH = 'xpath'
export const XPATH_LOG = 'xpath/log'
import { from, ROOT } from 'mycelium-uri'
import { pass } from './lib/remote.js'
import { park } from './lib/wait.js'
import { changes } from './lib/changes.js'

// What a request lists of one target's changes at most: beyond it, a count.
export const LISTED = 100

// What an action says, as the request has it: a text, or { message,
// attachments }.
function said (answer, protocol, action) {
  const a = typeof answer === 'string' ? { message: answer } : answer
  if (!a || typeof a !== 'object' || typeof a.message !== 'string' || !a.message.trim()) throw new Error(`nothing said: ${protocol}/${action} answers with what happened, in words`)
  return { message: a.message, attachments: a.attachments ?? [] }
}
// A count said: 2 reads, 1 put; those that are none left out.
const counts = c => Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k.slice(0, -1) : k}`).join(', ')
// An error's causes, outermost first: the messages down its chain.
const causesOf = err => { const out = []; for (let c = err?.cause; c && out.length < 20; c = c.cause) out.push(c.message ?? String(c)); return out }

// The targets an action writes, those the mrepo has: main, runtime, help,
// protocols, links.
export const TARGETS = ['main', 'runtime', 'info', 'protocols', 'links']

// A path as the execution reads and writes by, given either way: relative
// from the mrepo's root (runtime/service.json), or slash-led
// (/runtime/service.json), meaning the same.
const abs = path => (path.startsWith('/') ? path : slashed(path))

// What is not there, said with what is: the protocol (the mrepo's
// protocols), or the action (the protocol's actions).
const unknown = (actions, protocol, action) => actions[protocol]
  ? `no action: ${protocol} ${action} (${Object.keys(actions[protocol]).sort().join(', ')})`
  : `no protocol: ${protocol} (${Object.keys(actions).sort().join(', ')})`

const heads = async backend => Object.fromEntries(await backend.listBranches())

// A request's execution branches: its own, by its key, one a target it
// writes: execute/<key>/<target>.
export const branchOf = (id, target) => `execute/${id}/${target}`

// One made from its target's head; there already (a waiting request's):
// brought up to its target. -> its name
async function open (w, backend, id, target) {
  const name = branchOf(id, target)
  if ((await heads(backend))[name]) await w.merge(target, name, `Sync with ${target}`, { author: AUTHOR, fastForward: true })
  else await w.createExecution(target, id)
  return name
}

// One removed: squashed or merged, or not (a failure's: discarded).
async function close (backend, id, target) {
  const name = branchOf(id, target)
  const at = (await heads(backend))[name]
  if (at) await backend.deleteBranch(name, at)
}

// A request's record written through its own execution
// branch of request/execute and merged back into it; the branch removed.
export async function executed ({ backend, writer: w }, name, record) {
  const branch = await open(w, backend, name, EXECUTE)
  const c = await w.change(branch)
  await c.put(`/${name}.json`, Buffer.from(JSON.stringify(record) + '\n'))
  await c.commit(`${name}: executed`, { author: AUTHOR })
  // A runtime running on the same repository sees the branch as a request
  // completed and merges it itself (execute, below). Whichever merges
  // first, the other finds it done: the branch gone.
  for (let i = 0; ; i++) {
    try {
      await w.merge(branch, EXECUTE, `Merge ${name}: executed`, { author: AUTHOR })
      await close(backend, name, EXECUTE)
      return
    } catch (err) {
      if (!(await heads(backend))[branch]) return
      if (i >= 20) throw err
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

export async function failed (ctx, why) {
  const names = []
  for (const p of await principals(ctx)) {
    if (isReturned(p.request) || p.waits) continue // done already; or waiting: not executing
    const { log, entries } = logger()
    log('error', 'runtime.failed', why)
    await executed(ctx, p.id, record(`/${EXECUTE}`, returned(logged(p.request, entries), 'failed', `Failed: the runtime's pass over it.\n${why}`), Number(p.id)))
    names.push(p.id)
  }
  return names
}
// A request with entries added to its log.
const logged = (request, entries) => ({ ...request, processing: { ...request.processing, log: [...request.processing.log, ...entries] } })

// The runtime's context as an execution reads it: read-only, no writer.
const runtimeView = ctx => Object.freeze({
  name: ctx.name,
  // its unique URI (<swarm>/<node>); its name where it has none
  uri: ctx.uri ?? ctx.name,
  work: ctx.work ?? null,
  dir: ctx.dir ?? null,
  // a request into the mrepo's own inbox, as its storage takes one
  submit: ctx.submit ?? null,
  answer: ctx.answer ?? null,
  // a command placed as the mrepo's own internal request, the request returned back
  own: ctx.own ?? null,
  branches: async () => (await ctx.backend.listBranches()).map(([b]) => b),
  // the protocols the runtime loaded, their configs by name
  protocols: ctx.protocols ?? {},
  // the types the mrepo holds (its avro layer), for what reads an answer
  types: ctx.types ?? null,
  select: uri => ctx.repo.select(abs(uri)),
  read: uri => ctx.repo.read(abs(uri)),
  find: uri => ctx.repo.find(abs(uri)),
  node: uri => ctx.repo.node(abs(uri)),
  children: node => ctx.repo.children(node),
  bytes: node => ctx.repo.bytes(node)
})

// actions: the mrepo's, by protocol and action: those its packages offer.
export async function execute (ctx, { actions = {} } = {}) {
  const { repo, backend, writer: w } = ctx
  // Each request on its own branch of request/execute, its principal the
  // request the branch is named after.
  for (const p of await principals(ctx)) {
    const name = p.id
    const request = p.request
    const form = request.form
    const written = r => executed(ctx, name, record(`/${EXECUTE}`, r, Number(name)))
    // returned already (a pass interrupted before the merge): merged now
    if (isReturned(request)) { await w.merge(p.branch, EXECUTE, `Merge ${name}: executed`, { author: AUTHOR }); await close(backend, name, EXECUTE); continue }
    // A command sent on (lib/remote.js): waiting for its child's answer,
    // it is not being processed; the answer added to its branch, the
    // principal is returned with it. A job waited for (lib/wait.js): its
    // result added, the request resumed: executed again with it
    // (exec.resumed), below.
    if (p.waits && !isReturned(p.response)) continue
    const was = request.processing.waiting
    // (what the job returned, as action code is handed it; what cannot be
    // read fails the request here, said: not the runtime's pass)
    let resumed = null
    if (was?.resume) {
      // catch: the job's answer not read: the request returned failed with why
      try { resumed = handed(ctx.types ?? null, p.response.returned) } catch (err) {
        await written(returned({ ...request, processing: { ...request.processing, waiting: null } }, 'failed', ['Failed, nothing of it kept.', `what the job returned: ${err.message}`, ...causesOf(err).map(c => `caused by: ${c}`)].join('\n')))
        continue
      }
    }
    if (was && !resumed) {
      const r = p.response
      // What was returned there is this request's answer. What happened
      // to it there is that request's own, in that mrepo's request/done:
      // linked (processing.sent), not copied. Its continuation comes back
      // with the answer (whoever asked goes on with it), its position
      // seen from here: behind the position the command was sent on at.
      const c = r.processing?.continuation
      await written({ ...request, processing: { ...request.processing, waiting: null, continuation: c ? { ...c, at: from(was.at, c.at) } : null }, returned: r.returned })
      continue
    }
    const present = await heads(backend)
    const targets = TARGETS.filter(t => present[t])
    // The action's context: reads overlaid (a target read from the request's
    // execution branch, once it wrote there), writes collected per target.
    // Two contexts: local, the action's (exec.commit(): the writes so far
    // committed to its execution branches, later reads see them;
    // exec.discard(): the uncommitted writes dropped; exec.rollback(): the
    // last local commit undone; exec.reset(): all of it ditched, back to the
    // start), for building up its changes and handling its errors; global,
    // the runtime's, not the action's: when the action ends, its writes
    // committed and its execution branches squashed into their targets,
    // once, then removed; a failure discards them, nothing squashed.
    // Its execution branches, made as it first writes a target: each with
    // the head it started from.
    const made = new Map()
    const ensure = async t => { if (!made.has(t)) { const b = await timed('branch', `Its execution branch of ${t} made.`, () => open(w, backend, name, t)); made.set(t, (await heads(backend))[b]) } }
    const snapshot = async () => { const h = await heads(backend); return new Map([...made.keys()].map(t => [t, h[branchOf(name, t)]])) }
    const edits = new Map()
    const targetOf = uri => {
      const [, first] = uri.split('/')
      return targets.includes(first) ? first : null
    }
    const inside = uri => uri.slice(uri.indexOf('/', 1) < 0 ? uri.length : uri.indexOf('/', 1)) || '/'
    const { protocol, action } = form
    const message = `${name}: ${protocol} ${action} ${joined(form.uri)}`
    // Its log: entries into the request's own, as much as its flag asks
    // for (log=info|verbose|debug; info without it).
    const began = Date.now()
    const { log: write, entries, level } = logger()
    // the flags in force: the request's, then what a command run here sets
    let flags = {}
    const take = given => {
      const { flags: good } = sorted(given)
      flags = { ...flags, ...good }
      if (good.log) level(good.log)
    }
    take(form.flags)
    // what the boundary counts, for the request's metrics
    const counted = { reads: 0, selects: 0, puts: 0, removes: 0, commits: 0 }
    // the step the action is at: the last event it logged
    let step = null
    // an action's entries, under its protocol and action: a line each
    const logOf = (p, a) => (lvl, event, line) => { write(lvl, `${p}.${a}.${event}`, line); step = `${p}.${a}.${event}` }
    // an action's step, measured for it: what it took, what it read and
    // wrote meanwhile (the counts that moved), said behind its line
    const stepOf = say => async (event, line, fn, lvl = 'verbose') => {
      const before = { ...counted }
      const t = Date.now()
      const took = () => { const moved = counts(Object.fromEntries(Object.keys(counted).map(k => [k, counted[k] - before[k]]))); return `(${Date.now() - t} ms${moved ? `; ${moved}` : ''})` }
      let r
      try { r = await fn() } catch (err) {
        say(lvl, event, `${typeof line === 'function' ? event : line}: failed, ${err.message} ${took()}`)
        throw err
      }
      say(lvl, event, `${typeof line === 'function' ? line(r) : line} ${took()}`)
      return r
    }
    // the boundary's own steps, at debug, each with what it took
    const timed = async (event, what, f) => { const t = Date.now(); const r = await f(); write('debug', `train.${event}`, `${what} (${Date.now() - t} ms)`); return r }
    // internal (no record of it in the inbox): no API, no state gate
    const internal = await isInternal(ctx, name)
    // what the action sent on, if it did (exec.forward): { to, command }
    let forwarded = null
    // the job it waits for, if it does (exec.wait): an async function
    let waited = null
    // the continuation the action answers with, if it does (exec.continuation)
    let continued = null
    const flush = async (what = message) => {
      for (const [t, list] of edits) {
        await ensure(t)
        await timed('commit', `${list.length} ${list.length === 1 ? 'write' : 'writes'} committed on its branch of ${t}.`, async () => {
          const c = await w.change(branchOf(name, t))
          for (const [op, path, bytes] of list) op === 'put' ? await c.put(path, bytes) : c.remove(path)
          await c.commit(what, { author: AUTHOR })
        })
        counted.commits++
      }
      edits.clear()
    }
    // Its execution branches set back: to the heads given (one made after:
    // to where it started); the writes not committed discarded.
    const back = async to => {
      edits.clear()
      const now = await heads(backend)
      for (const [t, from] of made) {
        const b = branchOf(name, t)
        const at = to.get(t) ?? from
        if (now[b] !== at) await backend.updateBranch(b, at, now[b])
      }
    }
    const rollbackAll = () => { commits.length = 0; return back(new Map()) }
    // The heads before each local commit: what a rollback goes back to.
    const commits = []
    const exec = Object.freeze({
      // the request's id: its record's key, request/done/<id>.json once done
      id: name,
      runtime: runtimeView(ctx),
      // A URI as the execution sees it: /main/x read from its execution
      // branch of main, once it has one.
      path: given => { const uri = abs(given); return made.has(targetOf(uri)) ? `/execute/${name}${uri}` : uri },
      select: uri => { counted.selects++; return repo.select(exec.path(uri)) },
      read: uri => { counted.reads++; return repo.read(exec.path(uri)) },
      // A file that may not be there: null when nothing is at the URI;
      // anything else that goes wrong is thrown, as read throws it.
      find: uri => { counted.reads++; return repo.find(exec.path(uri)) },
      // The tree itself, for a query: the one node at a plain URI (null when
      // nothing is there), as the execution sees it; a node's children,
      // [name, node] pairs, null for a file; a file's content.
      node: uri => { counted.selects++; return repo.node(exec.path(uri)) },
      children: node => { counted.selects++; return repo.children(node) },
      bytes: node => { counted.reads++; return repo.bytes(node) },
      put (given, bytes) { const uri = abs(given); const b = targetOf(uri); if (!b) throw new Error(`not writable here: ${given}`); counted.puts++; (edits.get(b) ?? edits.set(b, []).get(b)).push(['put', inside(uri), bytes]) },
      remove (given) { const uri = abs(given); const b = targetOf(uri); if (!b) throw new Error(`not writable here: ${given}`); counted.removes++; (edits.get(b) ?? edits.set(b, []).get(b)).push(['remove', inside(uri)]) },
      // The local commit: the writes so far committed to the execution
      // branches (later reads see them).
      commit: async (what = null) => { commits.push(await snapshot()); return flush(what ? `${message}: ${what}` : message) },
      // The uncommitted writes dropped.
      discard: () => { edits.clear() },
      // The last local commit undone (and what is not committed): back to the
      // commit before it.
      rollback: () => back(commits.length ? commits.pop() : new Map()),
      // Everything of this execution ditched, its local commits too: back to
      // where it started; the action goes on.
      reset: () => rollbackAll(),
      // A command executed here, in this execution: a line or its words,
      // understood, checked as this request is, its action run; what it
      // says. own: as the mrepo's own (a hook: not held at the door). at:
      // where it stands, the parts its URI is read behind (main by
      // default; a position there, where a haicc command went).
      run: async (command, { own = false, at = STANDING } = {}) => {
        // (the flags in force come with it, as with a command sent on:
        // written into its line)
        const parts = carrying(Array.isArray(command) ? command : words(command), flags, ctx.protocols ?? {})
        let inner
        // what its flags keep from being run: not run, said (as at the door)
        try { inner = understood(asked(lineOf(parts)), ctx.protocols ?? {}, at).form } catch (err) { throw err.unrun ? new Error(`not run: ${err.unrun.join('; ')}`) : err }
        const why = check(inner, await runtimeData(ctx), { internal: internal || own })
        if (why) throw new Error(why)
        const fn = actions[inner.protocol]?.[inner.action]
        if (!fn) throw new Error(unknown(actions, inner.protocol, inner.action))
        // its flags in force from here on; its entries under its own name
        take(inner.flags)
        // (what it attached: values to who ran it, whichever way it attached them)
        const a = said(await fn(Object.freeze({ ...exec, log: logOf(inner.protocol, inner.action), step: stepOf(logOf(inner.protocol, inner.action)) }), inner), inner.protocol, inner.action)
        return { message: a.message, attachments: opened(ctx.types ?? null, a.attachments) }
      },
      // The command sent on to the mrepo a shortcut leads to (to: xpath's
      // resolve): this request waits for its response, nothing of it is
      // executed here. The action returns what this returns.
      // A job waited for: the request parked until the job ends, the
      // runtime free meanwhile; then the action executed again with what
      // the job returned, exec.resumed ({ status, message, attachments }).
      // Its writes before it waits are dropped. One a request, not resumed
      // twice.
      // what the request was resumed with, after a wait: the same to an
      // action run inside it (exec.run); null when it was not
      resumed,
      wait: job => {
        if (waited || forwarded) throw new Error('waiting already')
        if (resumed) throw new Error('resumed already: no second wait')
        waited = job
        return null
      },
      forward: (to, command) => {
        if (forwarded || waited) throw new Error('sent on already')
        forwarded = { to, command }
        return null
      },
      // A continuation answered with the output: a script for who asked to
      // go on with (the terminal runs it with sh; an mrepo does not):
      // continuation(script, at): the script, its lines, and the position
      // in this mrepo they run at (`.`: this mrepo itself), sent on by the
      // terminal as haicc/script. One a request.
      continuation: (script, at = ROOT) => {
        if (continued) throw new Error('a continuation already')
        continued = continuationOf(script, at)
        return null
      },
      // An entry in the request's log: log(level, event, line), level one of
      // error, warn (always kept), info, verbose, debug (kept as the request
      // asks); stored under the action's protocol and action.
      log: logOf(protocol, action),
      // A step of the action, measured here: step(event, line, fn) runs fn
      // and logs the event (at verbose; level: another), its line, then
      // what it took and what it read and wrote meanwhile; line a text, or
      // a function of fn's result (what it found, said). -> fn's result. A
      // step that throws is logged too, then throws on.
      step: stepOf(logOf(protocol, action))
    })
    let result
    try {
      // Checked again as it executes: the state now, not as it was queued
      // (two queued while booted: the second initialise refused here).
      const why = check(form, await runtimeData(ctx), { internal })
      if (why) throw Object.assign(new Error(why), { refused: true })
      const fn = actions[protocol]?.[action]
      if (!fn) throw Object.assign(new Error(unknown(actions, protocol, action)), { refused: true })
      const answer = await fn(exec, form)
      if (forwarded || waited) result = { ok: true }
      else {
        // what it attached written as wrappers here, where a value that
        // does not fit still fails the request whole
        const a = said(answer, protocol, action)
        result = { ok: true, message: a.message, attachments: wrapped(ctx.types ?? null, a.attachments) }
      }
      if (!forwarded && !waited) await flush()
    } catch (err) {
      // The one place an error ends a request: what stopped it, the chain
      // of what caused it, the step the action was at, what is undone.
      const causes = causesOf(err)
      result = { ok: false, message: err.refused ? refusal(err.message) : ['Failed, nothing of it kept.', err.message, ...causes.map(c => `caused by: ${c}`)].join('\n') }
      const undone = counts({ commits: counted.commits, puts: counted.puts, removes: counted.removes })
      // (refused: nothing was run; why is what is returned, said once)
      if (!err.refused) write('error', 'request.failed', [`${err.message}${step ? `, at ${step}` : ''}.`, ...causes.map(c => `Caused by: ${c}.`), undone ? `Undone: ${undone}.` : 'Nothing to undo.', ...(level() === 'debug' && err.stack ? String(err.stack).split('\n').slice(1).map(l => l.trim()) : [])].join('\n'))
      forwarded = null
      waited = null
      continued = null
      await rollbackAll()
    }
    // Parked (exec.wait) or sent on (exec.forward): nothing of it executed
    // here, its writes dropped; what it waits for said on its principal,
    // on its branch: it stays there, waiting; the branch not being
    // processed any more. What it logged so far stays with it.
    if (waited || forwarded) {
      await rollbackAll()
      for (const t of made.keys()) await close(backend, name, t)
      try {
        const waiting = waited ? park(ctx, name, request, waited) : pass(ctx, name, request, forwarded.to, forwarded.command, flags)
        // (sent on: the request it became, linked: its mrepo and its offset there)
        const sent = forwarded ? { at: forwarded.to.at, mrepo: forwarded.to.mrepo, offset: waiting.offset } : null
        const c = await w.change(await open(w, backend, name, EXECUTE))
        await c.put(`/${name}.json`, Buffer.from(JSON.stringify(record(`/${EXECUTE}`, { ...logged(request, entries), processing: { ...logged(request, entries).processing, waiting, sent } }, Number(name))) + '\n'))
        await c.commit(waited ? `${name}: waiting for a job` : `${name}: sent on to ${forwarded.to.at}, waiting`, { author: AUTHOR })
      } catch (err) {
        write('error', 'request.failed', `${err.message}.`)
        await written(returned(logged(request, entries), 'failed', `Failed, nothing of it kept.\n${err.message}`))
      }
      continue
    }
    // Squashed into its target, each execution branch that moved (main
    // first): one commit there, the request's; then removed, squashed or
    // discarded.
    const changed = []
    if (result.ok) {
      const now = await heads(backend)
      for (const [t, from] of made) {
        const head = now[branchOf(name, t)]
        if (head === from) continue
        // what the request changed there
        const all = await changes(backend, from, head)
        const listed = all.slice(0, LISTED)
        const of = kind => listed.filter(c => c.change === kind).map(c => c.path)
        // (the same in the end, written and undone: nothing to say, and the squash makes no commit)
        if (all.length) changed.push({ target: t, added: of('added'), changed: of('changed'), removed: of('removed') })
        if (all.length > LISTED) write('info', 'request.changed', `${all.length} paths changed in ${t}: the first ${LISTED} listed.`)
        await timed('squash', `Its branch of ${t} squashed into it.`, () => w.squash(branchOf(name, t), t, message, { author: AUTHOR }))
      }
    }
    for (const t of made.keys()) await timed('removed', `Its branch of ${t} removed.`, () => close(backend, name, t))
    // The request returned, in its record, through its own execution branch.
    const done = measured({ ...logged(request, entries), processing: { ...logged(request, entries).processing, changed, waiting: null, continuation: continued } }, { ms: Date.now() - began, ...counted })
    await written(result.ok ? returned(done, 'done', result.message, result.attachments) : returned(done, 'failed', result.message))
  }
}
