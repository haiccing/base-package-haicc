// lay: runtime/lay . <path>, the runtime config of a package placed in the
// mrepo's folder laid into its runtime layer (README.md beside it).
import { existsSync, readFileSync } from 'bare-fs'
import Bundle from 'bare-bundle'
import { programAt } from '../../internal/program/index.js'

// What a package brings to the runtime layer: its hooks and the like, not
// the layer's own definition, not its pages.
const config = key => key.startsWith('/mrepo/runtime/') && key !== '/mrepo/runtime/.layer.json' && !key.endsWith('README.md')

export async function lay (exec, { args: [path] = [] }) {
  const dir = exec.runtime.dir
  if (!dir) throw new Error('no directory in the context')
  const p = programAt(dir, path)
  if (!existsSync(p.bundle)) throw new Error(`no package there: ${p.path} (its bundle, ${p.path}.bundle, in the mrepo's folder)`)
  const bundle = Bundle.from(readFileSync(p.bundle))
  const keys = Object.keys(bundle.files).filter(config).sort()
  if (!keys.length) throw new Error(`nothing to lay: ${p.path} brings no runtime config (mrepo/runtime/)`)
  const laid = []
  for (const key of keys) {
    const at = key.slice('/mrepo'.length)
    exec.put(at, bundle.read(key))
    laid.push(at.slice(1))
  }
  exec.log('info', 'laid', { package: p.path, files: laid })
  return { laid, from: p.path }
}
