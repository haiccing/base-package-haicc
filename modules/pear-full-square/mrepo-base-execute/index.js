// mrepo-base-execute: the execute protocol, base variant. One pass over its
// data state, given the runtime's context ({ name, repo, writer, backend }):
// a request on its own branch of request/execute (an envelope around the
// core, the pre-filled form), its form not yet completed:
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
//   4. the form completed with its output (or the error that stopped it),
//      written in its envelope through execute/<key>/request/execute, merged
//      into request/execute (the request completed: the request protocol
//      moves it to done, then starts the next pending)
// executed(ctx, name, record): step 4 alone, a form completed elsewhere (the
// boot's own request) handed over the same way; a runtime running on the
// repository may merge it first: found done then.
// failed(ctx, why): a runtime's pass that failed, its error in the request
// executing (its form completed with it: `runtime: <message>`); the names
// completed ([]: none was executing).
// A request is processed on its own branch of request/execute (begun there
// by the request protocol, straight from pending), which only ever adds: its
// principal, what it waits for, a child's response, its completion; merged
// into request/execute then, and removed.
// A command sent on (lib/remote.js): an action that finds its position a
// shortcut sends the command that follows to the mrepo linked there
// (exec.forward). The request's processing ends there: what it waits for is
// added to its principal; a request branch not being processed has a
// waiting principal. The request protocol adds the child's response to the
// branch; the principal is then returned with it here.
// A command executed here (exec.run): interpreted, checked as this request
// is, its action run in this same execution. Its URI is read as written
// where it stands: at the root for the mrepo's own (a hook), at main for
// one from outside, at the position a haicc command went to.
// A request's URI is an array of segments, a prefix then the URI as
// written (['main', 'host']); the paths the execution reads and writes by
// are given relative from the root (main/x) or slash-led (/main/x), the
// same.
// The request's log (its record's `log`): made here, at the boundary, for
// every request, whatever its action does:
//   info      what it gets unasked: what it changed, a target a line
//             (request.changed: the paths added, changed, removed), where
//             it was sent on (request.sent), and its metrics, the closing
//             line (request.metrics: ok, ms, reads, selects, puts, removes,
//             commits)
//   verbose   the action's steps, debug its internals: the action's own
//             entries (exec.log), stored under its protocol and action
//             (crud.read.<event>); and at debug this boundary's own steps
//             (train.<event>, each with its ms)
//   error     what stopped it (request.failed: the error, the chain of its
//             causes, the step it was at, what was undone; its stack at
//             debug); warn: a flag a request carries that is none (at the
//             door such a request is not run: mrepo-base-request,
//             problems; request.flag). Both always kept.
// How much is kept is the request's flag, log=info|verbose|debug (info
// without it). A flag holds through a chain until changed: a command run
// here (exec.run) can set it from there on, one sent on takes the flags in
// force with it, and the entries of the request it became come back with
// its response, each under its jump (`jump`: the positions gone through).
import { wrap, record, streamOf, complete, continuationOf, isComplete, logger, sorted, problems, AUTHOR, EXECUTE, check, runtimeData, isInternal, principals, formOf, joined, slashed, OUTSIDE, OWN } from 'mrepo-base-request'

// The XPath machinery's own layers, and its log of physical queries there.
export const XPATH = 'xpath'
export const XPATH_LOG = 'xpath/log'
import { from, ROOT } from 'mycelium-uri'
import { join } from 'bare-path'
import { pass } from './lib/remote.js'
import { park } from './lib/wait.js'
import { changes } from './lib/changes.js'

// What a request's audit lists of one target at most: beyond it, a count.
const LISTED = 100
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

// A request's record written (in its envelope) through its own execution
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
    if (isComplete(p.core) || p.waits) continue // done already; or waiting: not executing
    const { log, entries } = logger()
    log('error', 'runtime.failed', { error: why })
    await executed(ctx, p.id, wrap(`/${EXECUTE}`, complete(p.core, { ok: false, error: why }, entries)))
    names.push(p.id)
  }
  return names
}

// The runtime's context as an execution reads it: read-only, no writer.
const runtimeView = ctx => Object.freeze({
  name: ctx.name,
  // its unique URI (<swarm>/<node>); its name where it has none
  uri: ctx.uri ?? ctx.name,
  work: ctx.work ?? null,
  dir: ctx.dir ?? null,
  // a record into the mrepo's own inbox, as its storage takes one
  submit: ctx.submit ?? null,
  answer: ctx.answer ?? null,
  // a command placed as the mrepo's own internal request, its completed form back
  own: ctx.own ?? null,
  branches: async () => (await ctx.backend.listBranches()).map(([b]) => b),
  // the protocols the runtime loaded, their configs by name
  protocols: ctx.protocols ?? {},
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
    let core = p.core
    // completed already (a pass interrupted before the merge): merged now
    if (isComplete(core)) { await w.merge(p.branch, EXECUTE, `Merge ${name}: executed`, { author: AUTHOR }); await close(backend, name, EXECUTE); continue }
    // A wrapped remote command, passed on (lib/remote.js): waiting for its
    // child's response, it is not being processed; the response added to
    // its branch, the principal is returned with it. A job waited for
    // (lib/wait.js): its result added, the request resumed: executed again
    // with it (form.resumed), below.
    if (p.waits) {
      if (!p.response || !isComplete(p.response)) continue
      const r = p.response.value
      if (core.value.remote?.resume) {
        const { remote, ...rest } = core.value
        core = { ...core, value: { ...rest, resumed: 'error' in r ? { error: r.error } : { output: r.output ?? null } } }
        const c = await w.change(p.branch)
        await c.put(`/${name}.json`, Buffer.from(JSON.stringify(wrap(`/${EXECUTE}`, core)) + '\n'))
        await c.commit(`${name}: resumed`, { author: AUTHOR })
      }
    }
    const form = core.value
    if (p.waits && !core.value.resumed) {
      const r = p.response.value
      // its log: what it logged before it was sent on, then the entries of
      // the request it became, each under its jump
      const jump = e => ({ ...e, jump: [core.value.remote.at, ...(e.jump ?? [])] })
      const both = [...(core.value.log ?? []), ...(r.log ?? []).map(jump)]
      // its continuation comes back with it, its position seen from here:
      // behind the position the command was sent on at
      const continuation = r.continuation ? { ...r.continuation, at: from(core.value.remote.at, r.continuation.at) } : null
      await executed(ctx, name, wrap(`/${EXECUTE}`, complete(core, 'error' in r ? { ok: false, error: r.error } : { ok: true, value: r.output ?? null, continuation }, both)))
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
    const ensure = async t => { if (!made.has(t)) { const b = await timed('branch', { target: t }, () => open(w, backend, name, t)); made.set(t, (await heads(backend))[b]) } }
    const snapshot = async () => { const h = await heads(backend); return new Map([...made.keys()].map(t => [t, h[branchOf(name, t)]])) }
    const edits = new Map()
    const targetOf = uri => {
      const [, first] = uri.split('/')
      return targets.includes(first) ? first : null
    }
    const inside = uri => uri.slice(uri.indexOf('/', 1) < 0 ? uri.length : uri.indexOf('/', 1)) || '/'
    const { protocol, action } = form
    const message = `${name}: ${protocol} ${action} ${joined(form.uri)}`
    // Its log: entries into the request's own record, as much as its flag
    // asks for (log=info|verbose|debug; info without it). A flag that is
    // not one, or a value its flag does not take: ignored, and said.
    const began = Date.now()
    const { log: write, entries, level } = logger()
    // the flags in force: the request's, then what a command run here sets
    let flags = {}
    const take = written => {
      const { flags: good, ignored } = sorted(written)
      for (const i of ignored) write('warn', 'request.flag', { flag: i.flag, ignored: i.why })
      flags = { ...flags, ...good }
      if (good.log) level(good.log)
    }
    take(form.flags)
    // what the boundary counts, for the request's metrics
    const counted = { reads: 0, selects: 0, puts: 0, removes: 0, commits: 0 }
    // the physical queries its logical ones stood for (the physical log's record)
    const physical = []
    // the step the action is at: the last event it logged
    let step = null
    // an action's entries, under its protocol and action
    const logOf = (p, a) => (lvl, event, data) => { write(lvl, `${p}.${a}.${event}`, data); step = `${p}.${a}.${event}` }
    // an action's step, measured for it: what it took, what it read and
    // wrote meanwhile (the counts that moved)
    const stepOf = say => async (event, data, fn, lvl = 'verbose') => {
      const before = { ...counted }
      const t = Date.now()
      const moved = () => Object.fromEntries(Object.keys(counted).filter(k => counted[k] !== before[k]).map(k => [k, counted[k] - before[k]]))
      let r
      try { r = await fn() } catch (err) {
        say(lvl, event, { ...(typeof data === 'function' ? {} : data), failed: err.message, ms: Date.now() - t, ...moved() })
        throw err
      }
      const said = { ...(typeof data === 'function' ? data(r) : data), ms: Date.now() - t, ...moved() }
      say(lvl, event, said)
      // a physical query (a node set's batch, mrepo-base-xpath): kept for
      // the physical log too, whatever the request's own log keeps
      if (event === 'batch') physical.push({ ...(({ reads, selects, puts, removes, commits, ...query }) => query)(said) })
      return r
    }
    // the boundary's own steps, at debug, each with what it took
    const timed = async (event, data, f) => { const t = Date.now(); const r = await f(); write('debug', `train.${event}`, { ...data, ms: Date.now() - t }); return r }
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
        await timed('commit', { target: t, writes: list.length }, async () => {
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
      // A command executed here, in this execution: its parts interpreted,
      // checked as this request is, its action run; its value. own: as the
      // mrepo's own (a hook: not held at the door). at: where it stands, a
      // prefix its URI is read behind (none for the mrepo's own, main for
      // one from outside, by default).
      run: async (command, { own = false, at = internal || own ? OWN : OUTSIDE } = {}) => {
        // (the flags in force come with it, as with a command sent on)
        const given = Array.isArray(command) || typeof command === 'string' ? { command } : command
        const inner = formOf({ ...given, flags: { ...flags, ...(given.flags ?? {}) } }, ctx.protocols ?? {}, at)
        // what its flags keep from being run: not run, said (as at the door)
        const unrun = problems(inner, ctx.protocols ?? {})
        if (unrun.length) throw new Error(`not run: ${unrun.join('; ')}`)
        const why = check(inner, await runtimeData(ctx), { internal: internal || own })
        if (why) throw new Error(why)
        const fn = actions[inner.protocol]?.[inner.action]
        if (!fn) throw new Error(unknown(actions, inner.protocol, inner.action))
        // its flags in force from here on; its entries under its own name
        take(inner.flags)
        return (await fn(Object.freeze({ ...exec, log: logOf(inner.protocol, inner.action), step: stepOf(logOf(inner.protocol, inner.action)) }), inner)) ?? null
      },
      // The command sent on to the mrepo a shortcut leads to (to: xpath's
      // resolve): this request waits for its response, nothing of it is
      // executed here. The action returns what this returns.
      // A job waited for: the request parked until the job ends, the
      // runtime free meanwhile; then the action executed again with its
      // result, form.resumed ({ output } or { error }). Its writes before
      // it waits are dropped. One a request, not resumed twice.
      // what the request was resumed with, after a wait: the same to an
      // action run inside it (exec.run); null when it was not
      resumed: form.resumed ?? null,
      wait: job => {
        if (waited || forwarded) throw new Error('waiting already')
        if (form.resumed) throw new Error('resumed already: no second wait')
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
      // An entry in the request's log: log(level, event, data), level one of
      // error, warn (always kept), info, verbose, debug (kept as the request
      // asks); stored under the action's protocol and action.
      log: logOf(protocol, action),
      // A step of the action, measured here: step(event, data, fn) runs fn
      // and logs the event (at verbose; level: another) with what it took
      // (ms) and what it read and wrote meanwhile; data an object, or a
      // function of fn's result (what it found). -> fn's result. A step
      // that throws is logged too, then throws on.
      step: stepOf(logOf(protocol, action))
    })
    let result
    try {
      // Checked again as it executes: the state now, not as it was queued
      // (two queued while booted: the second initialise refused here).
      const why = check(form, await runtimeData(ctx), { internal })
      if (why) throw new Error(why)
      const fn = actions[protocol]?.[action]
      if (!fn) throw new Error(unknown(actions, protocol, action))
      result = { ok: true, value: (await fn(exec, form)) ?? null }
      if (continued) result.continuation = continued
      if (!forwarded && !waited) await flush()
    } catch (err) {
      // The one place an error ends a request: what stopped it, the chain
      // of what caused it, the step the action was at, what is undone.
      result = { ok: false, error: err.message }
      const causes = causesOf(err)
      write('error', 'request.failed', { error: err.message, ...(causes.length ? { causes } : {}), at: step, undone: { commits: counted.commits, puts: counted.puts, removes: counted.removes }, ...(level() === 'debug' && err.stack ? { stack: String(err.stack).split('\n').map(l => l.trim()) } : {}) })
      forwarded = null
      waited = null
      await rollbackAll()
    }
    // the request's metrics: its closing line
    const metrics = ok => write('info', 'request.metrics', { ok, ms: Date.now() - began, ...counted })
    // Sent on (exec.forward): nothing of it executed here, its writes
    // dropped; what it waits for added to its principal on its branch: it
    // stays there, waiting; the branch not being processed any more.
    if (waited) {
      await rollbackAll()
      for (const t of made.keys()) await close(backend, name, t)
      try {
        const value = park(ctx, name, core, waited)
        write('info', 'request.waiting', { offset: value.remote.offset })
        metrics(null)
        const c = await w.change(await open(w, backend, name, EXECUTE))
        await c.put(`/${name}.json`, Buffer.from(JSON.stringify(wrap(`/${EXECUTE}`, { ...core, value: { ...value, log: entries } })) + '\n'))
        await c.commit(`${name}: waiting for a job`, { author: AUTHOR })
      } catch (err) {
        await executed(ctx, name, wrap(`/${EXECUTE}`, complete(core, { ok: false, error: err.message })))
      }
      continue
    }
    if (forwarded) {
      await rollbackAll()
      for (const t of made.keys()) await close(backend, name, t)
      try {
        const value = pass(ctx, name, core, forwarded.to, forwarded.command, flags)
        write('info', 'request.sent', { to: forwarded.to.at, mrepo: forwarded.to.mrepo, offset: value.remote.offset })
        metrics(null)
        // what it logged so far stays with it, waiting
        const c = await w.change(await open(w, backend, name, EXECUTE))
        await c.put(`/${name}.json`, Buffer.from(JSON.stringify(wrap(`/${EXECUTE}`, { ...core, value: { ...value, log: entries } })) + '\n'))
        await c.commit(`${name}: sent on to ${forwarded.to.at}, waiting`, { author: AUTHOR })
      } catch (err) {
        await executed(ctx, name, wrap(`/${EXECUTE}`, complete(core, { ok: false, error: err.message })))
      }
      continue
    }
    // Squashed into its target, each execution branch that moved (main
    // first): one commit there, the request's; then removed, squashed or
    // discarded.
    if (result.ok) {
      const now = await heads(backend)
      for (const [t, from] of made) {
        const head = now[branchOf(name, t)]
        if (head === from) continue
        // its audit: what the request changed there
        const changed = await changes(backend, from, head)
        const listed = changed.slice(0, LISTED)
        const of = kind => listed.filter(c => c.change === kind).map(c => c.path)
        // (the same in the end, written and undone: nothing to say, and the squash makes no commit)
        if (changed.length) write('info', 'request.changed', { target: t, count: changed.length, added: of('added'), changed: of('changed'), removed: of('removed'), ...(changed.length > LISTED ? { more: changed.length - LISTED } : {}) })
        await timed('squash', { target: t }, () => w.squash(branchOf(name, t), t, message, { author: AUTHOR }))
      }
    }
    for (const t of made.keys()) await timed('removed', { target: t }, () => close(backend, name, t))
    metrics(result.ok)
    // The physical log: what the physical side did for this request, a
    // record under the request's offset in the xpath layer's log, written
    // into its folder as a file: no commit here (a read stays a read); the
    // runtime commits the folder at its checkpoints. A read of the xpath
    // layers themselves is not logged: the log would feed itself.
    if (physical.length && ctx.dir && /^\d{13}$/.test(name) && form.uri?.[0] !== XPATH) {
      streamOf(join(ctx.dir, XPATH_LOG)).put(Number(name), record(`/${XPATH_LOG}`, { request: Number(name), command: `${protocol}/${action}`, queries: physical }, Number(name)))
    }
    // The form completed, in its envelope, through its own execution branch.
    await executed(ctx, name, wrap(`/${EXECUTE}`, complete(core, result, entries)))
  }
}
