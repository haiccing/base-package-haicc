// lay: runtime/lay . <path>, the runtime config of a package placed in the
// mrepo's folder laid into its runtime layer (README.md beside it).
import { existsSync, readFileSync } from 'bare-fs'
import Bundle from 'bare-bundle'
import { programAt } from '../../internal/program/index.js'

// What a package brings to the runtime layer: its hooks and the like, not
// the layer's own definition, not its pages.
const config = key => key.startsWith('/mrepo/runtime/') && key !== '/mrepo/runtime/.layer.json' && !key.endsWith('README.md')

// log: none (which files it laid is what the request changed, said once: its processing's)
export async function lay (exec, { args: [path] = [] }) {
  const dir = exec.runtime.dir
  if (!dir) throw new Error('no directory in the context')
  const p = programAt(dir, path)
  if (!existsSync(p.bundle)) throw new Error(`no package there: ${p.path} (its bundle, ${p.path}.bundle, in the mrepo's folder)`)
  const bundle = Bundle.from(readFileSync(p.bundle))
  const keys = Object.keys(bundle.files).filter(config).sort()
  if (!keys.length) throw new Error(`nothing to lay: ${p.path} brings no runtime config (mrepo/runtime/)`)
  // (which files: what the request changed, in the runtime layer)
  for (const key of keys) exec.put(key.slice('/mrepo'.length), bundle.read(key))
  return `Laid the runtime config of ${p.path} into the runtime layer: ${keys.length} ${keys.length === 1 ? 'file' : 'files'}.`
}
