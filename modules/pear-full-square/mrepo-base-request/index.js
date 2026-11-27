// mrepo-base-request: the request protocol, base variant
//. One pass over its data states, given the runtime's
// context ({ work, name, backend, repo, writer, seen, types }: read
// access to the repository, the writer held by the runtime, the types
// the mrepo holds, its avro layer's, as the runtime read them). A stream holds records
// (lib/record.js), one level: the transport's envelope around a request
// (lib/request.js), self-contained; each hand-over is a new record around
// the same request.
//   new records in the inbox      (its head moved since it last looked: the
//   layer                         records after its pointer) checked (the
//                                 inbox is the root's validation point):
//                                 addressed to this repository's inbox; its
//                                 envelope a record and its value a request,
//                                 as their types say (the mrepo's own,
//                                 strict); its form understood from
//                                 its line; its URI canonical, its protocol
//                                 and action offered there; then queued, in
//                                 request/pending/default; else refused: the
//                                 request returned failed, saying why, in
//                                 request/done, and sent back
//   request/execute empty         the next pending request moved in
//   a returned request in         (execute returned it) in request/done, then
//   request/execute               cleared from request/execute; sent back:
//                                 in the outbox, when it names where its
//                                 answer goes (reply)
// A request keeps its name through its moves; a restart finishes a move half
// done (in both: the old place cleared). The boxes (lib/boxes.js) are layers.
import { join } from 'bare-path'
import { post, checkpoint, ensure, inboxFolder, inboxOf, outboxOf, drop, answered, offsetOf, queueOf, keyed, streamOf, INBOX, OUTBOX } from './lib/boxes.js'
import { record, stamp, tick, guid, continuationOf, CEILING, logger, LEVELS, ALWAYS, DETAIL } from './lib/record.js'
import { FLAGS, LAYER, NONE, typed, MODES, flagsOf, sorted, layerOf, modeOf, chained, rewrites } from './lib/flags.js'
import { layer, AUTHOR, STREAMS, declarationOf } from './lib/layer.js'
import { nameOf } from 'mycelium-container-document'
import { query } from 'mrepo-base-xpath'
import { viewOf, gitdirOf, setting, isWork, SETTING, MREPOS, SCRIPTS } from './lib/view.js'
import { relative, from, within, slashed, unslashed, segmented, joined, positionOf } from 'mycelium-uri'
import { interpret, read, carrying, layerFor, problems, passesOn, ROOT, MAIN, STANDING } from './lib/command.js'
import { hookOf, hookAt, HOOKS, TRANSITIONS } from './lib/hooks.js'
import { words, lineOf, parse, send, run as runLines } from './lib/lines.js'

export { follow } from './lib/follow.js'
import { asked, filled, understood, unread, noted, measured, returned, isReturned, STATUS } from './lib/request.js'
import { wrapped, opened, handed } from './lib/attachment.js'

export { asked, filled, understood, unread, noted, measured, returned, isReturned, STATUS, wrapped, opened, handed }
export { read, carrying, lineOf, NONE, typed, MREPOS, SCRIPTS, post, checkpoint, ensure, inboxFolder, inboxOf, outboxOf, drop, answered, offsetOf, queueOf, keyed, streamOf, nameOf, STREAMS, declarationOf, INBOX, OUTBOX, record, stamp, tick, guid, continuationOf, CEILING, logger, LEVELS, ALWAYS, DETAIL, FLAGS, LAYER, MODES, flagsOf, sorted, layerOf, modeOf, chained, rewrites, problems, passesOn, layerFor, layer, AUTHOR, viewOf, gitdirOf, setting, isWork, SETTING, interpret, relative, from, within, slashed, unslashed, segmented, joined, positionOf, ROOT, MAIN, STANDING, hookOf, hookAt, HOOKS, TRANSITIONS, words, parse, send, runLines }

export const PENDING = 'request/pending/default'
export const EXECUTE = 'request/execute'
export const DONE = 'request/done'
// The types the pass checks with, by their URIs (the runtime package's).
export const TYPES = { record: 'haiccing/base-package-runtime/record', request: 'haiccing/base-package-runtime/request' }

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

// A request returned, sent back: in the outbox, a record around it, when
// it names where its answer goes.
async function sendBack (ctx, name, request) {
  if (!request.reply) return
  await ensure(ctx, 'outbox')
  const rec = record(OUTBOX, request, Number(name))
  await layer(ctx, 'outbox').put(name, rec, `Output ${name}`)
  // Then its working folder: the record, for a subscriber watching it (git
  // first: the folder follows the record). Written whole, renamed into
  // place; the folder made if missing.
  if (ctx.dir) outboxOf(ctx.dir).put(Number(name), rec)
}

const branches = async ctx => Object.fromEntries(await ctx.backend.listBranches())

// What is said of a request refused: the outcome first, then why, a fact
// a line.
export const refusal = (...why) => ['Refused, nothing run.', ...why].join('\n')
export const unrunLines = why => ['Not run: its flags.', ...why].join('\n')

// What is wrong with something given as a record around a request, by the
// declared types, strict: the envelope (the record without its value) and
// its value, each checked by the types the mrepo holds (ctx.types, its avro
// layer's). -> the lines; [] when nothing is. Its types not held: said, an
// mrepo takes nothing in without them.
export function wrong (ctx, rec) {
  const missing = Object.values(TYPES).filter(t => !ctx.types?.held.includes(t))
  if (missing.length) return [`its types are not held here: ${missing.join(', ')} (the mrepo's avro layer; nothing is taken in without them)`]
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['not a record']
  const { value, ...envelope } = rec
  const said = (what, type, v) => { const r = ctx.types.valid(type, v); return r.valid ? [] : r.problems.map(p => `not a ${what} (${type}): ${p.at || '.'}, expected ${p.expected}`) }
  return [...said('record', TYPES.record, envelope), ...said('request', TYPES.request, value)]
}

// A request refused: returned failed, saying why; in request/done, sent
// back; from the inbox, the pointer past it.
async function refuse (ctx, name, request, message, origin, label = 'Refused') {
  const refused = returned(request, 'failed', message)
  await layer(ctx, DONE).put(name, record(`/${DONE}`, refused, Number(name)), `${label} ${name}`)
  await sendBack(ctx, name, refused)
  if (origin === 'inbox') await point(ctx, name)
  return refused
}

// The way into pending, the one handler every request passes: its form
// understood from its line (its words: <protocol>/<action> <URI>
// <arguments>; its URI taken as written where it stands: the mrepo's
// main, whoever asks), validated by where it comes from, then queued; or
// refused (returned failed, in request/done, sent back).
//   origin 'inbox'      the external checks: the API, the state as known now
//   origin 'internal'   the mrepo's own (its runtime's, an action's):
//                       trusted: any layer (by the flag), not asked whether
//                       its protocol is active
// No mark on the request: internal is having no record in the inbox, which
// keeps its history (isInternal).
// Its name: its offset (13 digits): the one it arrived with at the inbox;
// the mrepo's own, given here by the mrepo's clock.
// From the inbox, the pointer moves with it (POINTER): in the commit that
// queues it; after the one that keeps it in done when it is not queued.
// key: an answer collected for a request waiting here: the offset it had
// where it was answered, its record's key.
// -> { name, queued } or { name, refused: the message } (unrun: its flags)
export const POINTER = '.pointer'
const point = (ctx, name) => layer(ctx, PENDING).put(POINTER, { inbox: name }, `Inbox taken in to ${name}`)
export async function admit (ctx, request, { origin, name = null, at = null, key = null }) {
  name ??= nameOf(offsetOf(ctx))
  const taken = origin === 'inbox' ? { [POINTER]: { inbox: name } } : {}
  // an answer collected by the mrepo itself (a request returned, for one
  // waiting here): not a request to understand or check; queued
  if (origin === 'internal' && isReturned(request)) {
    await layer(ctx, PENDING).put(name, record(`/${PENDING}`, request, Number(name), key), `Response ${name}`)
    return { name, queued: true }
  }
  // (what is wrong with the request itself is said as it is; anything else
  // that fails taking it in is the runtime's)
  let why = null
  // what its flags keep from being run: nothing of it is (strict)
  let unrun = []
  try { request = understood(request, ctx.protocols ?? {}, at ?? STANDING) } catch (err) { if (err.unrun) unrun = err.unrun; else why = err.message }
  if (unrun.length) {
    for (const reason of unrun) request = noted(request, 'warn', 'request.flag', reason)
    const message = unrunLines(unrun)
    await refuse(ctx, name, request, message, origin, 'Not run')
    return { name, refused: message, unrun }
  }
  if (!why) {
    try { why = check(request.form, await runtimeData(ctx), origin === 'internal' ? { internal: true } : { state: false }) } catch (err) { why = `runtime: ${err.message}` }
  }
  if (why) {
    const message = refusal(why)
    await refuse(ctx, name, request, message, origin)
    return { name, refused: message }
  }
  const { protocol, action, uri } = request.form
  await layer(ctx, PENDING).put(name, record(`/${PENDING}`, request, Number(name)), `${origin === 'internal' ? 'Internal' : 'Request'} ${name}: ${protocol} ${action} ${joined(uri)}`, taken)
  return { name, queued: true }
}

// Whether a request is internal: no record of it in the inbox (the inbox
// keeps every record it was given; a preloaded request is internal too).
export async function isInternal (ctx, name) {
  if (!(await branches(ctx)).inbox) return true
  return !(await layer(ctx, 'inbox').has(name))
}

// An internal request: the mrepo's own, submitted straight to the handler.
// command: a line as typed, or its words. It names nowhere for its answer:
// nobody waits for it. Written as anyone writes one: it stands at main
// (at: a position there, the parts before its URI). -> admit's result
export const internal = (ctx, command, name = nameOf(offsetOf(ctx)), { at = null } = {}) => admit(ctx, asked(Array.isArray(command) ? lineOf(command) : command, { from: ctx.uri ?? ctx.name, to: ctx.uri ?? ctx.name }), { origin: 'internal', name, at })

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
// answer, its completion; then it is merged into request/execute and
// removed (no history kept in the execute branches: request/done has it).
export const requestBranch = id => `execute/${id}/${EXECUTE}`

// The request branches here, each with its principal (the request the branch
// is named after): { id, branch, request, waits (the offset, at the child,
// of the request it was sent on as: processing.waiting.offset), response
// (the child's request returned, once added: the branch's other record,
// under the offset it was given here, its key the child's) }.
// A branch not being processed has a waiting principal: waits, no response.
export async function principals (ctx) {
  const out = []
  for (const [b] of await ctx.backend.listBranches()) {
    const id = b.match(/^execute\/([^/]+)\/request\/execute$/)?.[1]
    if (!id) continue
    const read = n => ctx.repo.read(`/${b}/${n}.json`).then(x => JSON.parse(x.toString()), () => null)
    const request = (await read(id))?.value
    if (!request) continue
    const waits = request.processing?.waiting?.offset ?? null
    let response = null
    if (waits !== null) {
      for (const [path, n] of await ctx.repo.select(`/${b}/*`)) {
        const other = n.type === 'blob' && path.endsWith('.json') ? path.slice(path.lastIndexOf('/') + 1, -'.json'.length) : null
        if (!other || other === id || other.startsWith('.')) continue
        const back = await read(other)
        if (back?.key === String(waits) && isReturned(back.value)) response = back.value
      }
    }
    out.push({ id, branch: b, request, waits, response })
  }
  return out
}

// A request begun: its branch made from request/execute, its principal added.
export async function begin (ctx, name, request) {
  const branch = requestBranch(name)
  if (!(await branches(ctx))[branch]) await ctx.writer.createExecution(EXECUTE, name)
  const c = await ctx.writer.change(branch)
  await c.put(`/${name}.json`, Buffer.from(JSON.stringify(record(`/${EXECUTE}`, request, Number(name))) + '\n'))
  await c.commit(`Execute ${name}`, { author: AUTHOR })
}

export async function request (ctx) {
  ctx.seen ??= {}
  const pending = layer(ctx, PENDING)
  const execute = layer(ctx, EXECUTE)
  const done = layer(ctx, DONE)
  // where an answer to a request waiting here is addressed (its reply):
  // that request's own branch, by this mrepo's unique URI (its name where
  // it has none)
  const mine = `/${ctx.uri ?? ctx.name}/execute/`
  const forMine = r => typeof r?.reply === 'string' && r.reply.startsWith(mine)

  // The waiting principals' answers collected: each child's request
  // returned, from its outbox folder (the linked mrepo's:
  // processing.waiting.folder), through the handler into pending, as the
  // mrepo's own.
  const all = await principals(ctx)
  if (ctx.dir) {
    // (queued already: an answer for that request in pending, not yet on
    // its branch)
    const queuedNow = []
    for (const n of await pending.list()) { const r = await pending.read(n); if (isReturned(r.value)) queuedNow.push(`${r.value.reply}|${r.key}`) }
    for (const p of all) {
      if (!p.waits || p.response || queuedNow.includes(`${mine}${p.id}|${p.waits}`)) continue
      const out = outboxOf(join(ctx.dir, p.request.processing.waiting.folder))
      if (!out.has(p.waits)) continue
      const back = out.read(p.waits).value
      if (isReturned(back)) await admit(ctx, back, { origin: 'internal', key: String(p.waits) })
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
      let rec = null
      // catch: a record that does not read is none: refused below
      try { rec = await box.read(name) } catch {}
      // by its types, before its content is looked at: what is no record
      // around a request is returned as what stands for it (unread)
      const why = wrong(ctx, rec)
      if (why.length) { await refuse(ctx, name, unread({ reply: rec?.value?.reply }), refusal(...why), 'inbox'); continue }
      // misdelivered: the record's topic
      if (rec.topic !== here) { await refuse(ctx, name, rec.value, refusal(`misdelivered: for ${rec.topic}, this is ${here}`), 'inbox'); continue }
      // returned already: an answer, not something to run; none is taken
      // in from outside (an answer is collected by who waits for it)
      if (isReturned(rec.value)) { await done.put(name, record(`/${DONE}`, rec.value, Number(name)), `Stray response ${name}`); await point(ctx, name); continue }
      await admit(ctx, rec.value, { origin: 'inbox', name })
    }
    ctx.seen.inbox = head
  }

  // A request returned: to done, then out of execute; sent back.
  for (const name of await execute.list()) {
    const rec = await execute.read(name)
    if (!isReturned(rec.value)) continue
    await done.put(name, record(`/${DONE}`, rec.value, Number(name), rec.key ?? null), `Done ${name}`)
    await execute.remove(name, `Done ${name}: out of execute`)
    // a child's answer, merged in with its principal: kept in done, not
    // sent on (it arrived where it was addressed: a request's branch here)
    if (!forMine(rec.value)) await sendBack(ctx, name, rec.value)
  }

  // The next pending request begun on its own branch (a move half done
  // finished first). The queue in the order requests arrived in it: its
  // commit chain. One at a time: not while a request is being processed (a
  // branch whose principal is not waiting) or a returned one is still in
  // request/execute.
  const now = await principals(ctx)
  const queued = await pending.arrived()
  for (const name of queued.filter(n => now.some(p => p.id === n))) await pending.remove(name, `${name}: on its branch`)
  const busy = now.some(p => !p.waits || p.response) || (await execute.list()).length > 0
  const next = queued.find(n => !now.some(p => p.id === n))
  if (!busy && next) {
    const rec = await pending.read(next)
    // An answer to a principal waiting here (addressed to that request's
    // branch, /<mrepo>/execute/<key>): not begun as a request: added to
    // that branch, a record of its own beside the principal; the execute
    // protocol then returns the principal with it.
    const id = isReturned(rec.value) && forMine(rec.value) ? rec.value.reply.slice(mine.length) : null
    if (id !== null) {
      const p = now.find(x => x.id === id)
      if (p && rec.key === String(p.waits)) {
        // (under the offset it was given here: one name through this mrepo)
        const c = await ctx.writer.change(p.branch)
        await c.put(`/${next}.json`, Buffer.from(JSON.stringify(record(`/${EXECUTE}`, rec.value, Number(next), rec.key)) + '\n'))
        await c.commit(`${id}: the response of ${rec.key}`, { author: AUTHOR })
      } else {
        // nobody waits for it here: kept, in done
        await done.put(next, record(`/${DONE}`, rec.value, Number(next), rec.key ?? null), `Stray response ${next}`)
      }
      await pending.remove(next, `${next}: a response${p ? ` for ${id}` : ''}`)
      return
    }
    await begin(ctx, next, rec.value)
    await pending.remove(next, `${next}: on its branch`)
  }
}
