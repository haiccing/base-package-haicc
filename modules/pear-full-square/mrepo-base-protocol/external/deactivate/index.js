// deactivate: protocol/deactivate . <protocol>, an active protocol made inactive (README.md beside it).
import { activeAt } from '../../internal/config.js'

export async function deactivate (exec, { args = [] }) {
  const [name] = args
  if (!name) throw new Error('missing argument: protocol')
  if (await exec.find(activeAt(name)) === null) throw new Error(`not active: ${name}`)
  exec.remove(activeAt(name))
  exec.log('verbose', 'deactivated', { protocol: name })
  return { deactivated: name }
}
