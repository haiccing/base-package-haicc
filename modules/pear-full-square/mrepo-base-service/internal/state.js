// The service state, in the runtime layer (/runtime/service.json: { state }),
// read and moved by the service actions, each firing its transition's
// hooks first; and the protocol's config: each action at the mrepo itself
// (`.`), in the states
// that allow it (the state machine: booted -> initialised -> started, and
// back).
import * as json from 'mycelium-value-json'
import { hookOf, parse, runLines } from 'mrepo-base-request'

export const STATE = '/runtime/service.json'

// log: none (one read; moveTo and transition say what was done)
export async function stateOf (exec) {
  return JSON.parse((await exec.read(STATE)).toString())
}

// The state moved: the answer says what was done (done: initialised,
// started, stopped, shut down) and the state the service is in now.
export async function moveTo (exec, state, done) {
  const was = await stateOf(exec)
  exec.put(STATE, json.encode({ ...was, state }))
  exec.log('verbose', 'moved', { from: was.state, to: state })
  return { service: done, state }
}

// A transition made: its hook file (/runtime/hooks/<transition>.haicc, the
// mrepo's defining package's), lines of simple commands, run through the
// mrepo's own inbox, each its own request; the request waits for them
// (exec.wait), the runtime free meanwhile to execute them; then resumed,
// the state moved. A line that fails fails the transition: the state stays.
// Idempotent: from `from` it moves to `state`; in any other state its
// config allows (the state it leads to, or past it: initialise on a
// started mrepo), it is a repeat: its hook run again (the hook's work is
// what makes a repeat safe: an initialise again adds what is new), a
// warning, the state as it is.
export async function transition (exec, name, state, done, form = {}, from = null) {
  const resumed = form.resumed ?? exec.resumed ?? null
  if (resumed?.error) throw new Error(`hook ${name}: ${resumed.error}`)
  if (!resumed) {
    const text = await hookOf(exec, name)
    if (text !== null) {
      const lines = parse(text)
      exec.log('debug', 'hooks', { transition: name, lines: lines.length })
      return exec.wait(() => runLines({ dir: exec.runtime.dir, uri: exec.runtime.uri, submit: exec.runtime.submit, answer: exec.runtime.answer, own: exec.runtime.own }, lines, '.'))
    }
  } else exec.log('info', 'hooks', { transition: name, ran: (resumed.output ?? []).map(r => r.line) })
  const was = (await stateOf(exec)).state
  if (from !== null && was !== from) {
    exec.log('warn', 'again', { transition: name, state: was })
    return { service: done, state: was, again: true }
  }
  return moveTo(exec, state, done)
}
