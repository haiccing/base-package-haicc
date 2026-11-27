// lines: a script's lines, each a simple command, split into its words and
// run one after the other through the mrepo's own inbox.
import { asked } from './request.js'
import { drop, answered } from './boxes.js'
import { handed } from './attachment.js'

// A line's words, as the shell splits them: on blanks, a quoted part ('…'
// or "…") one word with its quotes taken off; a backslash in "…" keeps the
// next character. Blank lines and # comments: none.
export function words (line) {
  const out = []
  let w = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" || c === '"') {
      const end = c === "'" ? line.indexOf("'", i + 1) : closing(line, i + 1)
      if (end < 0) throw new Error(`not a command: ${line} (a quote not closed)`)
      w = (w ?? '') + unescape(line.slice(i + 1, end), c)
      i = end
    } else if (/\s/.test(c)) { if (w !== null) { out.push(w); w = null } } else w = (w ?? '') + c
  }
  if (w !== null) out.push(w)
  return out
}
const closing = (s, from) => { for (let i = from; i < s.length; i++) { if (s[i] === '\\') { i++; continue } if (s[i] === '"') return i } return -1 }
const unescape = (s, q) => (q === '"' ? s.replace(/\\(.)/g, '$1') : s)

// The script's commands: [{ n, line, words }], n its line's number.
export function parse (text) {
  const lines = typeof text === 'string' ? text.replace(/\r/g, '').split('\n').map((line, i) => ({ n: i + 1, line: line.trim() })).filter(l => l.line && !l.line.startsWith('#')) : []
  if (!lines.length) throw new Error('missing argument: script')
  return lines.map(l => ({ ...l, words: words(l.line) }))
}

// Words written as one line, the way back: a word with a blank or a quote
// in it, or none at all, in double quotes, its backslashes and double
// quotes kept by a backslash. words(lineOf(w)) is w.
export const lineOf = parts => parts.map(w => (w !== '' && !/[\s'"\\]/.test(w) ? w : `"${w.replace(/[\\"]/g, '\\$&')}"`)).join(' ')

// One command sent to the mrepo's own inbox, as its own (from and to the
// mrepo itself, its answer to its outbox), its answer waited for in its
// outbox folder. command: the line as typed, or its words. -> { offset,
// request }: the request returned, and its offset there (its identity: its
// record in request/done found by it after; none for the runtime's own,
// `own`)
export async function send ({ dir, uri, submit = null, answer = null, own = null }, command, { timeout = 300 } = {}) {
  const line = Array.isArray(command) ? lineOf(command) : command
  // (own: the runtime's: the command placed as the mrepo's own internal
  // request, straight into its request layers, the request returned back)
  if (own) return { offset: null, request: await own(line) }
  const request = asked(line, { from: uri, to: uri, reply: `/${uri}/outbox` })
  // (submit: the runtime's, as its storage takes a request; else its
  // folder, dropped as everyone drops one) -> its offset
  const offset = submit ? await submit(request) : drop(dir, uri, request)
  // (answer: the runtime's, its outbox layer read; else its folder watched)
  if (answer) {
    for (const end = Date.now() + timeout * 1000; ;) {
      const back = await answer(offset)
      if (back) return { offset, request: back }
      if (Date.now() >= end) throw new Error(`no response in ${timeout} s: ${line}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  const back = await answered(dir, offset, { timeout })
  if (back === null) throw new Error(`no response in ${timeout} s: ${line}`)
  return { offset, request: JSON.parse(back).value }
}

// The lines run where the script was sent (at: a position in main, `.`
// the mrepo itself), each after the one before, the first that fails
// ending it. -> [{ line, returned }]; given the mrepo's types (runtime.types),
// what each returned is as action code is handed it, its attachments their
// values (lib/attachment.js); without, as it is stored
export async function run (runtime, lines, at = '.') {
  const out = []
  for (const l of lines) {
    const { request } = await send(runtime, at === '.' ? l.line : `${lineOf(['haicc', at])} ${l.line}`)
    if (request.returned.status === 'failed') throw new Error(`line ${l.n}: ${l.line}: ${request.returned.message}`)
    out.push({ line: l.line, returned: runtime.types ? handed(runtime.types, request.returned) : request.returned })
  }
  return out
}
