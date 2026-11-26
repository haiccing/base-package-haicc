// stop: runtime/stop . <path>, the program of a package placed in the
// mrepo's folder ended (README.md beside it).
import { programAt, end } from '../../internal/program/index.js'

export async function stop (exec, { args: [path] = [] }) {
  const dir = exec.runtime.dir
  if (!dir) throw new Error('no directory in the context')
  const p = programAt(dir, path)
  const r = await exec.step('program', x => (x ? `Its program ended, pid ${x.pid}, ${x.how}.` : 'No program of it running.'), () => end(p.state))
  return r ? `Ended the program of ${p.path}, pid ${r.pid} (${r.how}).` : `The program of ${p.path} was not running: nothing ended.`
}
