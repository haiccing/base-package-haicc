// The runtime's one way to a type, on a registry mounted for the test: a
// work folder, type files at the schema registry's own position.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { registryOf, mountOf } from '../index.js'

// A type's file at its URI, in the mounted registry.
function mount (work, uri, schema) {
  const f = join(mountOf(work), ...uri.split('/')) + '.avsc'
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, typeof schema === 'string' ? schema : JSON.stringify(schema))
}
const PART = { type: 'record', name: 'haiccing.basePackageX.part', fields: [{ name: 'n', type: 'long' }] }
const WHOLE = { type: 'record', name: 'haiccing.basePackageX.whole', fields: [{ name: 'title', type: 'string' }, { name: 'parts', type: { type: 'array', items: 'haiccing.basePackageX.part' }, default: [] }] }

test('the registry: a type asked by its name, where the registry is; the types it names read with it; a value checked, strictly', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'registry-'))
  try {
    t.is(mountOf(work), join(work, 'mrepos', 'local', 'avro-registry', 'avro'), 'where it reads: the schema registry\'s own position, its avro layer\'s folder')
    mount(work, 'haiccing/base-package-x/part', PART)
    mount(work, 'haiccing/base-package-x/whole', WHOLE)
    const reg = registryOf(work)
    t.is(reg.type('haiccing/base-package-x/whole').name, 'haiccing.basePackageX.whole', 'a type by its URI; the one it names read first')
    t.is(reg.type('haiccing/base-package-x/whole'), reg.type('haiccing/base-package-x/whole'), 'read once, kept')
    t.alike(reg.valid('haiccing/base-package-x/whole', { title: 'a', parts: [{ n: 1 }] }), { valid: true }, 'a value of it')
    t.alike(reg.valid('haiccing/base-package-x/whole', { title: 'a', parts: [{ n: 'one' }] }).problems.map(p => p.at), ['parts/0/n'], 'not one: the place said')
    t.absent(reg.valid('haiccing/base-package-x/whole', { title: 'a', more: 1 }).valid, 'strict: a field it does not name')
    t.exception(() => reg.type('haiccing/base-package-x/none'), /unknown type: haiccing\/base-package-x\/none \(not in the schema registry/, 'a type it does not hold: said, with where it looked')
    t.exception(() => reg.type('../packages/x'), /not a type's name/, 'a path out of it: refused')
    mount(work, 'haiccing/base-package-x/lone', { type: 'record', name: 'haiccing.basePackageX.lone', fields: [{ name: 'p', type: 'haiccing.basePackageX.gone' }] })
    t.exception(() => reg.type('haiccing/base-package-x/lone'), /unknown type: haiccing\/base-package-x\/gone/, 'one that names a type the registry does not hold: said')
  } finally { rmSync(work, { recursive: true, force: true }) }
})
