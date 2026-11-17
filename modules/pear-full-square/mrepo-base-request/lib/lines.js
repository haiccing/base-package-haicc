// lines: a script's lines, each a simple command, split into its words and
// run one after the other through the mrepo's own inbox.
import { existsSync, readFileSync, watch } from 'bare-fs'
import { join } from 'bare-path'
import { record, wrap, guid } from './record.js'
import { inboxOf } from './boxes.js'

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

// One command sent to the mrepo's own inbox, tagged as its own (internal),
// its response waited for in its outbox folder. -> its completed form
export async function send ({ dir, uri, submit = null, answer = null, own = null }, parts, { timeout = 300 } = {}) {
  // (own: the runtime's: the command placed as the mrepo's own internal
  // request, straight into its request layers, its completed form back)
  if (own) return own(parts)
  const key = guid()
  const core = { ...record('/haicc/script', parts, key), headers: { trigger: 'internal', by: uri } }
  const envelope = wrap(`/${uri}/inbox`, core)
  // (submit: the runtime's, as its storage takes a record; else its folder)
  if (submit) await submit(key, envelope)
  else inboxOf(dir).write(key, envelope)
  // (answer: the runtime's, its outbox layer read; else its folder watched)
  if (answer) {
    for (const end = Date.now() + timeout * 1000; ;) {
      const form = await answer(key)
      if (form) return form
      if (Date.now() >= end) throw new Error(`no response in ${timeout} s: ${parts.join(' ')}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  const back = join(dir, 'outbox', `${key}.json`)
  let arrived = () => {}
  let watcher = null
  // catch: a folder that cannot be watched is looked at instead, every 200 ms
  try { watcher = watch(join(dir, 'outbox'), () => arrived()); watcher.on('error', () => {}) } catch {}
  try {
    for (const end = Date.now() + timeout * 1000; !existsSync(back);) {
      if (Date.now() >= end) throw new Error(`no response in ${timeout} s: ${parts.join(' ')}`)
      await new Promise(resolve => { const t = setTimeout(resolve, 200); arrived = () => { clearTimeout(t); resolve() } })
    }
    return JSON.parse(readFileSync(back, 'utf8')).value.value
  } finally { watcher?.close() }
}

// The lines run where the script was sent (at: a position in main, `.`
// the mrepo itself), each after the one before, the first that fails
// ending it. -> [{ line, output }]
export async function run (runtime, lines, at = '.') {
  const out = []
  for (const l of lines) {
    const form = await send(runtime, at === '.' ? l.words : ['haicc', at, ...l.words])
    if ('error' in form) throw new Error(`line ${l.n}: ${l.line}: ${form.error}`)
    out.push({ line: l.line, output: form.output ?? null })
  }
  return out
}
