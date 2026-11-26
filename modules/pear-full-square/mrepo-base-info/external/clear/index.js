// clear: info/clear, the info layer's build removed (README.md beside it).
import { joined } from 'mycelium-uri'
import { built, LAYER } from '../../internal/info/index.js'

export async function clear (exec, { uri }) {
  const at = joined(uri)
  if (at !== '.' && at !== 'main') throw new Error(`info clear: the whole mrepo only, . (not ${at})`)
  const files = [...await built(exec)]
  // Idempotent: nothing built, nothing removed, a warning.
  if (!files.length) { exec.log('warn', 'nothing built', 'A repeat: nothing built here, nothing removed.'); return 'Nothing built in the info layer: nothing removed.' }
  await exec.step('remove', () => `Its build removed: ${files.length} files.`, async () => {
    for (const p of files) if (await exec.find(`/${LAYER}${p}`) !== null) { exec.log('debug', 'removed', `Removed ${p}.`); exec.remove(`/${LAYER}${p}`) }
  })
  return `Cleared the info layer's build: ${files.length} ${files.length === 1 ? 'file' : 'files'} removed.`
}
