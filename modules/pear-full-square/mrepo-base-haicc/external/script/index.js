// script: haicc <URI> haicc/script '<lines>', the lines executed where the
// URI points, each a simple command (README.md beside it).
import { segmented, joined, ROOT } from 'mycelium-uri'
import { MAIN } from 'mrepo-base-xpath'
import { parse, runLines as run } from 'mrepo-base-request'

// The position a request stands at, from main: `.` the mrepo itself.
export const positionAt = uri => { const whole = joined(segmented(uri)); return whole === ROOT || whole === MAIN ? '.' : whole.startsWith(`${MAIN}/`) ? whole.slice(MAIN.length + 1) : whole }

// lines run through the mrepo's own inbox; the request waits for them,
// then answers with what each gave
export async function runLines (exec, text, uri) {
  if (exec.resumed) {
    if (exec.resumed.error) throw new Error(exec.resumed.error)
    return exec.resumed.output
  }
  const lines = parse(text)
  const at = positionAt(uri)
  exec.log('verbose', 'script', { at, lines: lines.length })
  return exec.wait(() => run({ dir: exec.runtime.dir, uri: exec.runtime.uri, submit: exec.runtime.submit, answer: exec.runtime.answer }, lines, at))
}

// log: in runLines, above
export const script = (exec, { uri, args = [] }) => runLines(exec, args.join(' '), uri)
