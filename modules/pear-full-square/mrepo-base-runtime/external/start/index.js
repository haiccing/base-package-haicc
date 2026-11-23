// start: runtime/start . <path>, the program of a package placed in the
// mrepo's folder started as its own process (README.md beside it).
import { existsSync } from 'bare-fs'
import { programAt, stateOf, launch } from '../../internal/program/index.js'

// (bare: what Bare is started with, a test's when it is not this process's)
export async function start (exec, { args: [path] = [] }, { bare } = {}) {
  const dir = exec.runtime.dir
  if (!dir) throw new Error('no directory in the context')
  const p = programAt(dir, path)
  if (!existsSync(p.bundle)) throw new Error(`no package there: ${p.path} (its bundle, ${p.path}.bundle, in the mrepo's folder)`)
  const was = stateOf(p.state)
  if (was) { exec.log('verbose', 'running already', { program: p.path, pid: was.pid }); return { started: p.path, already: true, state: was } }
  const s = await exec.step('program', r => ({ program: p.path, pid: r?.pid ?? null }), () => launch({ bundle: p.bundle, dir, state: p.state, ...(bare ? { bare } : {}) }))
  if (!s) throw new Error(`its program did not start: ${p.path} (no state written in 10 s: ${p.path}.state.json)`)
  exec.log('info', 'started', { program: p.path, pid: s.pid })
  return { started: p.path, state: s }
}
