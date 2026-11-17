// A package's info, extracted from its own files as a runtime would
// extract it, the package its own top: no problem (internal/info). Run
// inside the package (its dispatcher's /test/info): this file at
// modules/pear-full-square/mrepo-base-info/validate/, the package four
// folders up.
import test from 'brittle'
import { readFileSync, readdirSync, statSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { fileURLToPath } from 'bare-url'
import { extract } from '../internal/info/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WANTED = k => k.endsWith('/README.md') || k === '/package.json' || k === '/mrepo/packages/layer.json' || k === '/modules/third-party.json'

function files (dir, at = '') {
  return readdirSync(join(dir, at)).sort().flatMap(n => {
    const p = `${at}/${n}`
    if (p === '/modules/node_modules') return []
    return statSync(join(dir, p)).isDirectory() ? files(dir, p) : [p]
  })
}

test('its info: every page reached by its menus, none against the rules', (t) => {
  const pj = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const paths = files(root)
  const wanted = Object.fromEntries(paths.filter(WANTED).map(p => [p, readFileSync(join(root, p))]))
  const out = extract([{ pkg: `haiccing/${pj.name}`, files: wanted, paths }], { alone: true })
  const index = JSON.parse(out['/index.json'].toString())
  t.ok(index['.']?.[0]?.page, `its README the top (${Object.keys(index).length} keywords)`)
  const problems = JSON.parse(out['/problems.json'].toString())
  for (const p of problems) t.comment(`${p.page ?? p.keyword}: ${p.check}: ${p.detail}`)
  t.is(problems.length, 0, 'no problems')
})
