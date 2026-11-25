// mrepo-base-request: the request protocol, base variant
//. One pass over its data states, given the runtime's
// context ({ work, name, backend, repo, writer, seen }: read access to
// the repository, the writer held by the runtime). Records are an onion
// (lib/record.js): an envelope around the core, the pre-filled form; each
// hand-over replaces the envelope, the core never changes on the way.
//   new envelopes in the inbox    (its head moved since it last looked: the
//   layer                         records in it in no request layer yet)
//                                 checked (the inbox is the root's validation
//                                 point): addressed to this repository's
//                                 inbox; the form's api this repository's
//                                 type, its URI canonical, its protocol and
//                                 action offered there; then the core, in a
//                                 new envelope, in request/pending/default;
//                                 else refused: the form completed with its
//                                 error, in request/done, and sent back (an
//                                 error taking it in the same: `runtime:
//                                 <message>`)
//   request/execute empty         the next pending request moved in
//   a completed form in           (execute filled it in) its core, in a new
//   request/execute               envelope, in request/done, then cleared
//                                 from request/execute; the completed form
//                                 sent back: in the outbox, in an envelope,
//                                 when its core names where it is to arrive
// A record keeps its name through its moves; a restart finishes a move half
// done (in both: the old place cleared). The boxes (lib/boxes.js) are layers.
import { join } from 'bare-path'
import { post, checkpoint, ensure, inboxFolder, inboxOf, outboxOf, drop, answered, offsetOf, queueOf, keyed, streamOf, INBOX, OUTBOX } from './lib/boxes.js'
import { record, wrap, stamp, tick, guid, complete, continuationOf, CEILING, isComplete, logger, LEVELS, ALWAYS, DETAIL } from './lib/record.js'
import { FLAGS, LAYER, MODES, flagsOf, sorted, layerOf, modeOf, chained, rewrites } from './lib/flags.js'
import { layer, AUTHOR, STREAMS, declarationOf } from './lib/layer.js'
import { nameOf } from 'mycelium-container-document'
import { query } from 'mrepo-base-xpath'
import { viewOf, gitdirOf, setting, isWork, SETTING, MREPOS, SCRIPTS } from './lib/view.js'
import { relative, from, within, slashed, unslashed, segmented, joined, positionOf } from 'mycelium-uri'
import { interpret, formOf, layerFor, problems, passesOn, ROOT, MAIN, OUTSIDE, OWN } from './lib/command.js'
import { hookOf, hookAt, HOOKS, TRANSITIONS } from './lib/hooks.js'
import { words, parse, send, run as runLines } from './lib/lines.js'

export { follow } from './lib/follow.js'
export { encodeRecord, decodeRecord, logHandler, REQUEST } from './lib/typed.js'
export { MREPOS, SCRIPTS, post, checkpoint, ensure, inboxFolder, inboxOf, outboxOf, drop, answered, offsetOf, queueOf, keyed, streamOf, nameOf, STREAMS, declarationOf, INBOX, OUTBOX, record, wrap, stamp, tick, guid, complete, continuationOf, CEILING, isComplete, logger, LEVELS, ALWAYS, DETAIL, FLAGS, LAYER, MODES, flagsOf, sorted, layerOf, modeOf, chained, rewrites, problems, passesOn, layerFor, layer, AUTHOR, viewOf, gitdirOf, setting, isWork, SETTING, interpret, formOf, relative, from, within, slashed, unslashed, segmented, joined, positionOf, ROOT, MAIN, OUTSIDE, OWN, hookOf, hookAt, HOOKS, TRANSITIONS, words, parse, send, runLines }

export const PENDING = 'request/pending/default'
export const EXECUTE = 'request/execute'
export const DONE = 'request/done'

// The runtime's data the check reads: the service state (where the mrepo
// has a service), the protocols the runtime loaded, their configs by name
// (ctx.protocols: { <protocol>: { actions: { <action>: { uris, states } } } }),
// and the active ones: those with their file in the protocols layer
// (/protocols/<protocol>.json, written by protocol/activate), by name.
export async function runtimeData ({ repo, protocols = null }) {
  // a document that may not be there: null then; one that is there and is
  // no document is an error (said as the request's: runtime data: ...)
  const read = async p => {
    const bytes = await repo.find(p)
    if (bytes === null) return null
    try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${p}`, { cause: err }) }
  }
  const active = {}
  for (const [p] of await repo.select('/protocols/*')) {
    const name = p.slice(p.lastIndexOf('/') + 1)
    if (name.endsWith('.json') && name !== '.layer.json') active[name.slice(0, -5)] = await read(p) ?? {}
  }
  return { service: await read('/runtime/service.json'), protocols, active }
}

// A URI against a pattern of an action's config. Both are written where
// the outside stands, at main: segments, <name> any one, ** the rest (none
// too): `.`, <name>, swarms/**, **.
export function matches (pattern, uri) {
  const segments = x => (x === ROOT ? [] : x.split('/').filter(Boolean))
  const p = segments(pattern)
  const u = segments(uri)
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '**') return true
    if (i >= u.length) return false
    if (!/^<.+>$/.test(p[i]) && p[i] !== u[i]) return false
  }
  return p.length === u.length
}

// What an action's config asks for and the request does not give: null, or
// `missing argument: <name>`.
//   target    a target is needed: the URI as it was written (its last
//             segment) is not `.`, the position itself (the mrepo, which
//             one cannot deploy or tear down); left out, it is `.`
//   args      the arguments by name, in order; one ending in ? is optional
export function missing (cfg, uri, args = []) {
  if (!cfg) return null
  if (cfg.target && uri.at(-1) === ROOT) return 'missing argument: target'
  for (const [i, n] of (cfg.args || []).entries()) {
    if (n.endsWith('?')) continue
    if (args?.[i] === undefined || args[i] === '') return `missing argument: ${n}`
  }
  return null
}

// A request checked: null when allowed, else why not.
//   always             a form, its URI an array of segments, each a
//                      relative URI in its canonical form
//   from outside       (the inbox's) its protocol loaded and its action
//                      configured, said with what is there when not; what
//                      the action's config asks for given (missing); its URI
//                      the prefix of its layer (main by default; another
//                      by its flag, layer=<name>) and what is written behind it (one
//                      segment, or a position in main and the URI written
//                      there), together a URI the config names (its
//                      patterns are written at main); and
//                      now (state: true, as it
//                      executes): its protocol active (nothing is by
//                      default: protocol/activate, from a hook), and an
//                      action that names its states (the service's own) in
//                      one of them
//   internal           the mrepo's own (not from the inbox: a hook, an
//                      action's): not asked whether active; what its
//                      action's config asks for given; its states where the
//                      action names them
// At the inbox neither the activation nor the state is checked (state:
// false): the queue may hold requests that change them first.
export function check (value, { service, protocols, active }, { state = true, internal = false } = {}) {
  if (!value || typeof value !== 'object') return 'not a request'
  let uri
  try { uri = segmented(value.uri) } catch (err) { return err.message }
  const { protocol, action } = value
  const cfg = protocols?.[protocol]?.actions?.[action]
  const now = () => (state && cfg?.states && service && !cfg.states.includes(service.state)) ? `not now: ${protocol} ${action} (the service is ${service.state})` : null
  if (internal) return missing(cfg, uri, value.args) ?? now()
  if (!protocols?.[protocol]) return `no protocol: ${protocol} (${Object.keys(active ?? {}).sort().join(', ')})`
  if (!cfg) return `no action: ${protocol} ${action} (${Object.keys(protocols[protocol].actions ?? {}).sort().join(', ')})`
  // (before its URI is looked at: a target left out is the position itself
  // and would only be said not offered there)
  const lacks = missing(cfg, uri, value.args)
  if (lacks) return lacks
  // (the layer it stands at: main by default, another by its flag)
  const at = layerFor(value, protocols)
  const inLayer = uri.length >= 2 && uri[0] === at ? joined(uri.slice(1)) : null
  if (inLayer === null || !(cfg.uris || []).some(p => matches(p, inLayer))) return `not offered: ${protocol} ${action} at ${inLayer ?? joined(uri)}`
  if (!state) return null
  if (!active?.[protocol]) return `not now: ${protocol} ${action} (${protocol} is not active${service ? `; the service is ${service.state}` : ''})`
  return now()
}

// The completed form sent back: in the outbox, in its envelope, when its core
// names where it is to arrive.
async function sendBack (ctx, name, core) {
  if (!core.topic) return
  await ensure(ctx, 'outbox')
  const envelope = wrap(OUTBOX, core, Number(name))
  await layer(ctx, 'outbox').put(name, envelope, `Output ${name}`)
  // Then its working folder: the record, for a subscriber watching it (git
  // first: the folder follows the record). Written whole, renamed into
  // place; the folder made if missing.
  if (ctx.dir) outboxOf(ctx.dir).put(Number(name), envelope)
}

const branches = async ctx => Object.fromEntries(await ctx.backend.listBranches())

// The inbox's records not yet taken in, in the order they arrived (its commit
// chain): in no request layer (every one taken in ends in request/done, a
// refused one too).
// The way into pending, the one handler every request passes: a command as
// typed interpreted (its parts: <protocol>/<action> <URI> <arguments>; its
// URI taken as written where its writer stands: main from the inbox, the
// root for the mrepo's own),
// validated by where it comes from, then queued; or refused (its form
// completed with the error, in request/done, sent back). The inbox itself
// checks nothing.
//   origin 'inbox'      the external checks: the API, the state as known now
//   origin 'internal'   the mrepo's own (its runtime's, an action's):
//                       trusted, its URI canonical only
// No mark on the request: internal is having no record in the inbox, which
// keeps its history (isInternal).
// Its name: its offset (13 digits): the one it arrived with at the inbox;
// the mrepo's own, given here by the mrepo's clock.
// From the inbox, the pointer moves with it (POINTER): in the commit that
// queues it; after the one that keeps it in done when it is not queued.
// -> { name, queued, refused }
export const POINTER = '.pointer'
const point = (ctx, name) => layer(ctx, PENDING).put(POINTER, { inbox: name }, `Inbox taken in to ${name}`)
export async function admit (ctx, core, { origin, name = null, at = null }) {
  name ??= nameOf(origin === 'internal' && isComplete(core) ? offsetOf(ctx) : (core?.offset ?? offsetOf(ctx)))
  if (core && core.offset == null) core = { ...core, offset: Number(name) }
  const taken = origin === 'inbox' ? { [POINTER]: { inbox: name } } : {}
  let why = null
  let form = core?.value
  // a command as typed (its parts): interpreted here, the form filled in
  // with its protocol, action, URI and arguments (lib/command.js)
  if (core && (typeof form === 'string' || Array.isArray(form))) { form = { command: form }; core = { ...core, value: form } }
  // a response collected by the mrepo itself (a completed form, for a
  // request waiting here): not a request to interpret or check; queued
  if (origin === 'internal' && isComplete(core)) {
    await layer(ctx, PENDING).put(name, wrap(`/${PENDING}`, core, Number(name)), `Response ${name}`)
    return { name, queued: true }
  }
  // (what is wrong with the request itself is said as it is; anything else
  // that fails taking it in is the runtime's)
  try {
    const filled = formOf(form, ctx.protocols ?? {}, at ?? (origin === 'internal' ? OWN : OUTSIDE))
    if (filled !== form) { form = filled; core = { ...core, value: form } }
  } catch (err) { why = err.message }
  // what its flags keep from being run: nothing of it is (strict); the
  // request completes, not failed, saying so, each reason a warning
  const unrun = !why && form && typeof form === 'object' ? problems(form, ctx.protocols ?? {}) : []
  if (unrun.length) {
    const { log, entries } = logger()
    for (const reason of unrun) log('warn', 'request.flag', { reason })
    const done = complete(core, { ok: true, value: notRun(form, unrun) }, entries)
    await layer(ctx, DONE).put(name, wrap(`/${DONE}`, done), `Not run ${name}`)
    await sendBack(ctx, name, done)
    if (origin === 'inbox') await point(ctx, name)
    return { name, notRun: unrun }
  }
  if (!why) {
    try { why = check(form, await runtimeData(ctx), origin === 'internal' ? { internal: true } : { state: false }) } catch (err) { why = `runtime: ${err.message}` }
  }
  if (why) {
    const refused = complete(core ?? record(null, null, Number(name)), { ok: false, error: why })
    await layer(ctx, DONE).put(name, wrap(`/${DONE}`, refused), `Refused ${name}`)
    await sendBack(ctx, name, refused)
    if (origin === 'inbox') await point(ctx, name)
    return { name, refused: why }
  }
  await layer(ctx, PENDING).put(name, wrap(`/${PENDING}`, core), `${origin === 'internal' ? 'Internal' : 'Request'} ${name}: ${form.protocol} ${form.action} ${joined(form.uri)}`, taken)
  return { name, queued: true }
}

// A command its flags keep from being run: what it answers. `run: false`,
// the command as typed, the reasons.
export const notRun = (form, why) => ({ run: false, command: Array.isArray(form.command) ? form.command.join(' ') : (form.command ?? `${form.protocol}/${form.action}`), why })

// Whether a request is internal: no record of it in the inbox (the inbox
// keeps every record it was given; a preloaded request is internal too).
export async function isInternal (ctx, name) {
  if (!(await branches(ctx)).inbox) return true
  return !(await layer(ctx, 'inbox').has(name))
}

// An internal request: the mrepo's own, submitted straight to the handler,
// tagged as triggered internally. Its topic null: nobody waits for it.
// at: where its command stands (OWN, the mrepo's root, by default; OUTSIDE,
// main, for a line written as from outside: a hook's). -> admit's result
export const internal = (ctx, form, name = nameOf(offsetOf(ctx)), { at = null } = {}) => admit(ctx, { ...record(null, form, Number(name)), headers: { trigger: 'internal' } }, { origin: 'internal', name, at })

// The inbox's records not yet taken in, first come, first served: those
// after the pointer (the last one taken in, kept with the queue:
// request/pending/default/.pointer.json), in their natural order.
export async function arriving (ctx) {
  const b = await branches(ctx)
  if (!b.inbox) return []
  // catch: no pointer yet: nothing taken in, all of them
  const pointer = b[PENDING] ? await ctx.repo.read(`/${PENDING}/${POINTER}.json`).then(x => JSON.parse(x.toString()).inbox, () => null) : null
  // read as a topic: its records after the pointer, ascending: an
  // XPathResult, iterated; only the folders from the pointer's on are
  // touched. Its layer declares its structure (its config); one that
  // declares none is a folder, no inbox: said.
  const topic = await query(reading(ctx), ['inbox', pointer === null ? '*' : `*[@offset>${Number(pointer)}]`], { mode: 'logical', ascending: true })
  if (topic.metadata()?.logical.mode !== 'logical') throw new Error('the inbox is a folder, no topic: its layer declares no structure (inbox/.layer.json, structure: offset-files)')
  return (await topic.all()).map(ref => nameOf(Number(ref.at.match(/@offset=(\d+)\]$/)[1])))
}
// The mrepo as a query reads it, outside a request's execution: the
// runtime's own reads of its topics (nothing measured: no request's log).
const reading = ctx => ({
  id: null,
  node: uri => ctx.repo.node(slashed(uri)),
  children: node => ctx.repo.children(node),
  bytes: node => ctx.repo.bytes(node),
  find: path => ctx.repo.find(path),
  step: (event, data, fn) => fn()
})

// A request's own branch of request/execute: execute/<key>/request/execute.
// The request is processed there, never in request/execute itself, and the
// branch only ever adds: its principal, what it waits for, a child's
// response, its completion; then it is merged into request/execute and
// removed (no history kept in the execute branches: request/done has it).
export const requestBranch = id => `execute/${id}/${EXECUTE}`

// The request branches here, each with its principal (the request the branch
// is named after): { id, branch, core, waits (the child's offset it waits
// for, at the child, its command passed on), response (the child's
// completed form, once added: the branch's other record, under the offset
// it was given here) }.
// A branch not being processed has a waiting principal: waits, no response.
export async function principals (ctx) {
  const out = []
  for (const [b] of await ctx.backend.listBranches()) {
    const id = b.match(/^execute\/([^/]+)\/request\/execute$/)?.[1]
    if (!id) continue
    const read = n => ctx.repo.read(`/${b}/${n}.json`).then(x => JSON.parse(x.toString()), () => null)
    const core = (await read(id))?.value
    if (!core) continue
    const waits = core.value?.remote?.offset ?? null
    let response = null
    if (waits !== null) {
      for (const [path, n] of await ctx.repo.select(`/${b}/*`)) {
        const other = n.type === 'blob' && path.endsWith('.json') ? path.slice(path.lastIndexOf('/') + 1, -'.json'.length) : null
        if (!other || other === id || other.startsWith('.')) continue
        const back = (await read(other))?.value
        if (back?.offset === waits && isComplete(back)) response = back
      }
    }
    out.push({ id, branch: b, core, waits, response })
  }
  return out
}

// A request begun: its branch made from request/execute, its principal added.
export async function begin (ctx, name, core) {
  const branch = requestBranch(name)
  if (!(await branches(ctx))[branch]) await ctx.writer.createExecution(EXECUTE, name)
  const c = await ctx.writer.change(branch)
  await c.put(`/${name}.json`, Buffer.from(JSON.stringify(wrap(`/${EXECUTE}`, core)) + '\n'))
  await c.commit(`Execute ${name}`, { author: AUTHOR })
}

export async function request (ctx) {
  ctx.seen ??= {}
  const pending = layer(ctx, PENDING)
  const execute = layer(ctx, EXECUTE)
  const done = layer(ctx, DONE)
  // where a response to a request waiting here is addressed: that request's
  // own branch, by this mrepo's unique URI (its name where it has none)
  const mine = `/${ctx.uri ?? ctx.name}/execute/`

  // The waiting principals' responses collected: each child's completed
  // form, from its outbox folder (the linked mrepo's: remote.folder), through
  // the handler into pending, as the mrepo's own.
  const all = await principals(ctx)
  if (ctx.dir) {
    // (queued already: a response for that request in pending, not yet on
    // its branch)
    const queuedNow = []
    for (const n of await pending.list()) { const c = (await pending.read(n)).value; if (isComplete(c)) queuedNow.push(`${c.topic}|${c.offset}`) }
    for (const p of all) {
      if (!p.waits || p.response || queuedNow.includes(`${mine}${p.id}|${p.waits}`)) continue
      const out = outboxOf(join(ctx.dir, p.core.value.remote.folder))
      if (!out.has(p.waits)) continue
      const back = out.read(p.waits).value
      if (back?.offset === p.waits && isComplete(back)) await admit(ctx, back, { origin: 'internal' })
    }
  }

  // The inbox taken in, when its head has moved, first come, first served:
  // each record after the pointer, in its natural order, through the handler
  // (admit), the pointer moved with it; not while the mrepo is not
  // operational yet (ctx.intake false: its own requests first, placed
  // straight; the records wait in the inbox, none taken ahead of another).
  const head = (await branches(ctx)).inbox
  if (head && head !== ctx.seen.inbox && ctx.intake !== false) {
    const box = layer(ctx, 'inbox')
    const here = `/${ctx.uri ?? ctx.name}${INBOX}`
    for (const name of await arriving(ctx)) {
      let envelope = null
      // catch: a record that does not read is no request: refused below, as one that is none
      try { envelope = await box.read(name) } catch {}
      // misdelivered: the envelope's, before its content is looked at
      if (envelope && envelope.topic !== here) {
        const refused = complete(envelope.value ?? record(null, null, Number(name)), { ok: false, error: `misdelivered: for ${envelope.topic}, this is ${here}` })
        await done.put(name, wrap(`/${DONE}`, refused, Number(name)), `Refused ${name}`)
        await sendBack(ctx, name, refused)
        await point(ctx, name)
        continue
      }
      // (its offset: the one it arrived under, whatever it says itself)
      const core = envelope?.value && typeof envelope.value === 'object' ? { ...envelope.value, offset: Number(name) } : null
      await admit(ctx, core, { origin: 'inbox', name })
    }
    ctx.seen.inbox = head
  }

  // A completed form: to done, then out of execute; sent back.
  for (const name of await execute.list()) {
    const core = (await execute.read(name)).value
    if (!isComplete(core)) continue
    const into = wrap(`/${DONE}`, core, Number(name))
    await done.put(name, into, `Done ${name}`)
    await execute.remove(name, `Done ${name}: out of execute`)
    // a child's response, merged in with its principal: kept in done, not
    // sent on (it arrived where it was addressed: a request's branch here)
    if (!(typeof core.topic === 'string' && core.topic.startsWith(mine))) await sendBack(ctx, name, core)
  }

  // The next pending request begun on its own branch (a move half done
  // finished first). The queue in the order requests arrived in it: its
  // commit chain. One at a time: not while a request is being processed (a
  // branch whose principal is not waiting) or a completed one is still in
  // request/execute.
  const now = await principals(ctx)
  const queued = await pending.arrived()
  for (const name of queued.filter(n => now.some(p => p.id === n))) await pending.remove(name, `${name}: on its branch`)
  const busy = now.some(p => !p.waits || p.response) || (await execute.list()).length > 0
  const next = queued.find(n => !now.some(p => p.id === n))
  if (!busy && next) {
    const core = (await pending.read(next)).value
    // A response to a principal waiting here (its core addressed to that
    // request's branch, /<mrepo>/execute/<key>): not begun as a request:
    // added to that branch, a record of its own beside the principal; the
    // execute protocol then returns the principal with it.
    const id = isComplete(core) && typeof core.topic === 'string' && core.topic.startsWith(mine) ? core.topic.slice(mine.length) : null
    if (id !== null) {
      const p = now.find(x => x.id === id)
      if (p?.waits === core.offset) {
        // (under the offset it was given here: one name through this mrepo)
        const c = await ctx.writer.change(p.branch)
        await c.put(`/${next}.json`, Buffer.from(JSON.stringify(wrap(`/${EXECUTE}`, core, Number(next))) + '\n'))
        await c.commit(`${id}: the response of ${core.offset}`, { author: AUTHOR })
      } else {
        // nobody waits for it here: kept, in done
        await done.put(next, wrap(`/${DONE}`, core, Number(next)), `Stray response ${next}`)
      }
      await pending.remove(next, `${next}: a response${p ? ` for ${id}` : ''}`)
      return
    }
    await begin(ctx, next, core)
    await pending.remove(next, `${next}: on its branch`)
  }
}
