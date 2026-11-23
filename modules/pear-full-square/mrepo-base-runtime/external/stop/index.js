// stop: runtime/stop . <path>, the program of a package placed in the
// mrepo's folder ended (README.md beside it).
import { programAt, end } from '../../internal/program/index.js'

export async function stop (exec, { args: [path] = [] }) {
  const dir = exec.runtime.dir
  if (!dir) throw new Error('no directory in the context')
  const p = programAt(dir, path)
  const r = await exec.step('program', x => ({ program: p.path, ended: x ?? null }), () => end(p.state))
  exec.log('info', r ? 'ended' : 'not running', { program: p.path, ...(r ?? {}) })
  return { stopped: p.path, ended: r }
}
