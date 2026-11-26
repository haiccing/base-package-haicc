// script: haicc <URI> haicc/script '<lines>', the lines executed where the
// URI points, each a simple command (README.md beside it).
import { segmented, joined, ROOT } from 'mycelium-uri'
import { MAIN } from 'mrepo-base-xpath'
import { parse, runLines as run } from 'mrepo-base-request'

// The position a request stands at, from main: `.` the mrepo itself.
export const positionAt = uri => { const whole = joined(segmented(uri)); return whole === ROOT || whole === MAIN ? '.' : whole.startsWith(`${MAIN}/`) ? whole.slice(MAIN.length + 1) : whole }

// lines run through the mrepo's own inbox; the request waits for them,
// then says what each said, each under its line
export async function runLines (exec, text, uri) {
  if (exec.resumed) {
    if (exec.resumed.status === 'failed') throw new Error(exec.resumed.message)
    return { message: exec.resumed.message, attachments: exec.resumed.attachments }
  }
  const lines = parse(text)
  const at = positionAt(uri)
  exec.log('verbose', 'script', `A script at ${at}: ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, each a request of its own.`)
  return exec.wait(async () => {
    const ran = await run({ dir: exec.runtime.dir, uri: exec.runtime.uri, submit: exec.runtime.submit, answer: exec.runtime.answer }, lines, at)
    return { message: [`Ran ${ran.length} ${ran.length === 1 ? 'line' : 'lines'} at ${at}.`, ...ran.map(r => `> ${r.line}\n${r.returned.message}`)].join('\n\n'), attachments: ran.flatMap(r => r.returned.attachments) }
  })
}

// log: in runLines, above
export const script = (exec, { uri, args = [] }) => runLines(exec, args.join(' '), uri)
