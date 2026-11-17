// A package's info as a running mrepo's runtime extracted it: its pages in
// the mrepo's info layer, none against the rules. Run by runtime run
// (/packages/<org>/<package>/test/info-in-situ), which names the mrepo
// (MREPO), the package (PACKAGE) and hands over the mrepo's state (SITU: a
// file; its info as extracted, { index, problems }); skipped without them.
import test from 'brittle'
import { readFileSync } from 'bare-fs'
import os from 'bare-os'

const MREPO = os.hasEnv('MREPO') ? os.getEnv('MREPO') : null
const PACKAGE = os.hasEnv('PACKAGE') ? os.getEnv('PACKAGE') : null
const SITU = os.hasEnv('SITU') ? os.getEnv('SITU') : null

test('its info in the mrepo: reached, none against the rules', { skip: !MREPO || !PACKAGE || !SITU }, async (t) => {
  const { index, problems: all } = JSON.parse(readFileSync(SITU, 'utf8')).info ?? {}
  const page = `packages/${PACKAGE}/README.md`
  t.ok(Object.values(index ?? {}).flat().some(c => c.page === page), `its README a page in ${MREPO}'s info, reached from the top`)
  const problems = (all ?? []).filter(p => (p.page ?? '').startsWith(`packages/${PACKAGE}`))
  for (const p of problems) t.comment(`${p.page}: ${p.check}: ${p.detail}`)
  t.is(problems.length, 0, 'no problems')
})
