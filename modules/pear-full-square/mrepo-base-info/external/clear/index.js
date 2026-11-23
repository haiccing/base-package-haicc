// clear: info/clear, the info layer's build removed (README.md beside it).
import { joined } from 'mycelium-uri'
import { built, LAYER } from '../../internal/info/index.js'

export async function clear (exec, { uri }) {
  const at = joined(uri)
  if (at !== '.' && at !== 'main') throw new Error(`info clear: the whole mrepo only, . (not ${at})`)
  const files = [...await built(exec)]
  // Idempotent: nothing built, nothing removed, a warning.
  if (!files.length) { exec.log('warn', 'nothing built', {}); return { removed: 0, again: true } }
  await exec.step('remove', () => ({ files: files.length }), async () => {
    for (const p of files) if (await exec.find(`/${LAYER}${p}`) !== null) { exec.log('debug', 'removed', { path: p }); exec.remove(`/${LAYER}${p}`) }
  })
  exec.log('info', 'cleared', { removed: files.length })
  return { removed: files.length }
}
