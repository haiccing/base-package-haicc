// A request, as the runtime package's types have it
// (haiccing/base-package-runtime, types/request.avsc): self-contained, what
// was asked and by whom, as understood, its processing, what is returned.
// Each function gives a new request; none changes one, none stores one.
//   asked(command, { from, to, reply, origin })  a request as it arrives:
//                                                the line as typed
//   filled(form, { from, to, reply, origin })    one whose form came filled in
//   understood(request, protocols, at)           its form, from its line
//   noted(request, level, event, line, time)     an entry added to its log
//   measured(request, metrics)                   its metrics
//   returned(request, status, message, attachments)
//                                                completed: done or failed
//   isReturned(request)                          completed already
//   unread({ reply })                            what stands for something
//                                                that came in and is no
//                                                request: to be returned
import { read, problems, STANDING } from './command.js'
import { typed } from './flags.js'
import { words } from './lines.js'

export const STATUS = ['done', 'failed']
const processing = () => ({ log: [], metrics: null, changed: [], waiting: null, sent: null, continuation: null })
const said = v => (v === undefined || v === null ? null : v)

// (who asked, who it is for, where its answer goes, its offset where it
// came from: the request's own, whatever carries it)
const own = ({ from = null, to = null, reply = null, origin = null } = {}) => ({ from: said(from), to: said(to), reply: said(reply), origin: said(origin) })

export function asked (command, addressed = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('not a command: a line, <protocol>/<action> <URI> <arguments>')
  return { command, ...own(addressed), form: null, processing: processing(), returned: null }
}

// A form as the type has it: its arguments texts, its flags the record, a
// field a flag (lib/flags.js, typed).
const formed = ({ protocol, action, uri, args = [], flags = {} }) => ({ protocol, action, uri, args: args.map(String), flags: typed(flags) })

export function filled (form, addressed = {}) {
  if (!form || typeof form.protocol !== 'string' || typeof form.action !== 'string' || !Array.isArray(form.uri)) throw new Error('not a form: its protocol, its action, its URI\'s segments')
  return { command: null, ...own(addressed), form: formed(form), processing: processing(), returned: null }
}

// Its line read by the one parser (the shell's words, lib/lines.js), then
// as the form the mrepo works with, where the writer stands
// (lib/command.js, read): throws, saying why, when it is no command. A
// request that has its form keeps it. What its flags keep from being run
// (problems: a flag that is none has no place in a form): thrown too, the
// reasons on the error (unrun).
export function understood (request, protocols = {}, at = STANDING) {
  if (!request.form && (typeof request.command !== 'string' || !request.command.trim())) throw new Error('not a command: a line, <protocol>/<action> <URI> <arguments>')
  const form = request.form ?? read(words(request.command), protocols, at)
  const unrun = problems(form, protocols)
  if (unrun.length) throw Object.assign(new Error(`its flags: ${unrun.join('; ')}`), { unrun })
  return request.form ? request : { ...request, form: formed(form) }
}

// Something that came in and is no request: a request with nothing asked
// in it, so that what is said of it has a place; its answer sent where
// the thing itself said, when it said so in a text.
export const unread = ({ reply = null } = {}) => ({ command: null, ...own({ reply: typeof reply === 'string' && reply ? reply : null }), form: null, processing: processing(), returned: null })

export function noted (request, level, event, line, time = new Date().toISOString()) {
  return { ...request, processing: { ...request.processing, log: [...request.processing.log, { time, level, event, line }] } }
}

export function measured (request, { ms, reads = 0, selects = 0, puts = 0, removes = 0, commits = 0 }) {
  return { ...request, processing: { ...request.processing, metrics: { ms, reads, selects, puts, removes, commits } } }
}

export const isReturned = request => Boolean(request) && typeof request === 'object' && request.returned != null

// Completed: how it ended and what is said of it, natural language (the
// outcome first, a fact a line); its data where data is the product, each
// attachment its name, its type's URI and where its value is.
export function returned (request, status, message, attachments = []) {
  if (!STATUS.includes(status)) throw new Error(`not a status: ${status} (${STATUS.join(', ')})`)
  if (typeof message !== 'string' || !message.trim()) throw new Error('nothing said: what is returned says what happened')
  if (isReturned(request)) throw new Error('returned already')
  return { ...request, returned: { status, message, attachments: attachments.map(({ name, type, at = null }) => ({ name, type, at })) } }
}
