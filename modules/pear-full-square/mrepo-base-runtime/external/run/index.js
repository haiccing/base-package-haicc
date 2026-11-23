// run: runtime/run . packages/<org>/<package>/<target>, an entry of a
// package the mrepo has linked, through that package's dispatcher
// (README.md beside it). What it runs is its first argument, a URI from the
// mrepo's root; the request's URI is where it is executed.
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'bare-fs'
import crypto from 'bare-crypto'
import { tmpdir } from 'bare-os'
import { join } from 'bare-path'
import { pathToFileURL } from 'bare-url'
import { relative } from 'mycelium-uri'

// The package and its target (a path inside the package: /test/validate).
function target (subject) {
  const m = relative(subject).match(/^packages\/([^/]+)\/([^/]+)(\/.*)?$/)
  if (!m) throw new Error(`not a package's entry: ${subject} (packages/<org>/<package>/<target>)`)
  return { pkg: `${m[1]}/${m[2]}`, target: m[3] ?? '/' }
}

export async function run (exec, { args: [subject, ...args] = [] }) {
  if (subject === undefined || subject === '') throw new Error('missing argument: target')
  const { pkg, target: t } = target(subject)
  if (t === '/run') throw new Error(`not run here: ${subject} (a package's program)`)
  // a document that may not be there: null then; one that is no document: an error
  const read = async p => {
    const bytes = await exec.find(p)
    if (bytes === null) return null
    try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${p}`, { cause: err }) }
  }
  const listed = (await read('/packages/manifest.json'))?.packages || {}
  if (!listed[pkg]) throw new Error(`not a package of this mrepo: ${pkg}`)
  const bundle = join(exec.runtime.dir, 'packages', `${pkg}.bundle`)
  if (!existsSync(bundle)) throw new Error(`its bundle missing: ${bundle}`)
  const dispatcher = await import(pathToFileURL(bundle).href)
  if (typeof dispatcher.run !== 'function') throw new Error(`${pkg} has no dispatcher`)
  const dryRun = args.includes('dry-run')
  // the in-situ tests: which mrepo (MREPO), which package (PACKAGE), and the
  // mrepo's state handed over (SITU: a file, removed after): its info as
  // extracted, its layers, its packages manifest, each linked bundle's hash
  const situ = mkdtempSync(join(tmpdir(), 'situ-'))
  let r
  try {
    const linked = {}
    for (const p of Object.keys(listed)) {
      const f = join(exec.runtime.dir, 'packages', `${p}.bundle`)
      linked[p] = existsSync(f) ? { sha256: crypto.createHash('sha256').update(readFileSync(f)).digest('hex') } : null
    }
    writeFileSync(join(situ, 'situ.json'), JSON.stringify({
      info: { index: await read('/info/index.json'), packages: await read('/info/packages.json'), problems: await read('/info/problems.json') },
      layers: (await exec.runtime.branches()).filter(b => !b.startsWith('execute/')),
      packages: listed,
      linked
    }))
    exec.log('debug', 'situ', { packages: Object.keys(listed).length, linked: Object.values(linked).filter(Boolean).length })
    r = await exec.step('run', x => ({ package: pkg, target: t, dryRun, units: x?.units?.length ?? null }), () => dispatcher.run(t, { dryRun, env: { MREPO: exec.runtime.dir, PACKAGE: pkg, SITU: join(situ, 'situ.json') } }))
  } finally { rmSync(situ, { recursive: true, force: true }) }
  if (dryRun) return { target: t, runs: r }
  if (t === '/protocol' || t === '/deploy') return { target: t, offers: Object.keys(r).filter(k => k !== 'default') }
  // a test's result: summarised in the log, whole in the output
  for (const u of r.units || []) exec.log(u.ok ? 'info' : 'error', 'unit', { unit: u.unit, ok: u.ok, tests: u.tests, failures: u.failures })
  return r
}

