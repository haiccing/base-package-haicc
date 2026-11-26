import test from 'brittle'
import { spawnSync } from 'bare-subprocess'
import { join, dirname } from 'bare-path'
import { fileURLToPath } from 'bare-url'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = (...args) => spawnSync(Bare.argv[0], [join(here, 'test', 'runtime.js'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })

test('version: the module and its version', (t) => {
  const r = runtime('version')
  t.is(r.status, 0)
  t.is(JSON.parse(String(r.stdout)).name, 'mrepo-base-runtime')
})

test('a bad call: exit 2', (t) => {
  t.is(runtime().status, 2)
  t.is(runtime('start').status, 2, 'start needs --work')
})
