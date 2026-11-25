import test from 'brittle'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { fileURLToPath } from 'bare-url'
import { tmpdir } from 'bare-os'
import Bundle from 'bare-bundle'
import { runtimeLay, runtimeStart, runtimeStop, programAt, programState, launchProgram } from '../index.js'

// An execution as the actions see it: the mrepo's folder, what was put.
const execIn = dir => {
  const puts = {}
  return { puts, runtime: { dir }, log () {}, step: (name, sum, fn) => fn(), put: (p, b) => { puts[p] = b.toString() } }
}
const folder = () => mkdtempSync(join(tmpdir(), 'program-'))

const here = join(dirname(fileURLToPath(import.meta.url)), '..')

test('programAt: a package by its path in the mrepo\'s folder; nothing outside it', (t) => {
  const p = programAt('/m', 'splectral/packages/splectral/base-component-help-viewer')
  t.is(p.bundle, '/m/splectral/packages/splectral/base-component-help-viewer.bundle')
  t.is(p.state, '/m/splectral/packages/splectral/base-component-help-viewer.state.json')
  t.is(programAt('/m', 'a/b.bundle').path, 'a/b', '.bundle left out')
  t.exception(() => programAt('/m', ''), /missing argument: package/)
  t.exception(() => programAt('/m', '../x'), /not a package in the mrepo's folder/)
  t.exception(() => programAt('/m', '/etc/x'), /not a package in the mrepo's folder/)
})

test('lay: a placed package\'s runtime config into the runtime layer, its hooks; nothing else', async (t) => {
  const dir = folder()
  try {
    const b = new Bundle()
    b.write('/mrepo/runtime/hooks/start.haicc', Buffer.from('runtime/start . a/b\n'))
    b.write('/mrepo/runtime/hooks/stop.haicc', Buffer.from('runtime/stop . a/b\n'))
    b.write('/mrepo/runtime/.layer.json', Buffer.from('{}'))
    b.write('/mrepo/runtime/README.md', Buffer.from('# runtime'))
    b.write('/mrepo/packages/.layer.json', Buffer.from('{}'))
    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'a', 'b.bundle'), b.toBuffer())
    const exec = execIn(dir)
    const r = await runtimeLay(exec, { args: ['a/b'] })
    t.alike(r.laid, ['runtime/hooks/start.haicc', 'runtime/hooks/stop.haicc'])
    t.is(exec.puts['/runtime/hooks/start.haicc'], 'runtime/start . a/b\n')
    t.absent(exec.puts['/runtime/.layer.json'], 'not the layer\'s own definition')
    t.absent(exec.puts['/packages/.layer.json'], 'nothing of another layer')
    await t.exception(runtimeLay(exec, { args: ['a/none'] }), /no package there/)
    const c = new Bundle()
    c.write('/mrepo/packages/.layer.json', Buffer.from('{}'))
    writeFileSync(join(dir, 'a', 'c.bundle'), c.toBuffer())
    await t.exception(runtimeLay(exec, { args: ['a/c'] }), /nothing to lay/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('start and stop: a placed package\'s program, its own process, its state beside it, ended with its runtime', async (t) => {
  const dir = folder()
  try {
    mkdirSync(join(dir, 'a'), { recursive: true })
    const exec = execIn(dir)
    await t.exception(runtimeStart(exec, { args: ['a/none'] }), /no package there/)
    // (the program: test/program.js in the bundle's place, launched as start launches it)
    const p = programAt(dir, 'a/p')
    const s = await launchProgram({ bundle: join(here, 'test', 'program.js'), dir, state: p.state })
    t.ok(s?.pid > 0, 'started: its state written')
    t.is(s.dir, dir, 'handed the mrepo\'s folder')
    t.is(s.runtime, Bare.pid, 'and the runtime it ends with')
    writeFileSync(p.bundle, '')
    const again = await runtimeStart(exec, { args: ['a/p'] })
    t.is(again.state.pid, s.pid, 'start: running already, left as it is')
    t.ok(again.already)
    const e = await runtimeStop(exec, { args: ['a/p'] })
    t.is(e.ended.pid, s.pid, 'stop: ended')
    t.absent(existsSync(p.state), 'its state gone')
    t.absent(programState(p.state))
    t.is((await runtimeStop(exec, { args: ['a/p'] })).ended, null, 'none running: nothing ended')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
