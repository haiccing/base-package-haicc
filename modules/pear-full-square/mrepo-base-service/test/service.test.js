// The service actions on a context written here: each moves the state; the
// config says where and when each is allowed.
import test from 'brittle'
import { initialise, start, stop, shutdown, STATE, stateOf } from '../index.js'

function context (state, hooks = {}) {
  const files = { [STATE]: Buffer.from(JSON.stringify({ state })) }
  for (const [t, text] of Object.entries(hooks)) files[`/runtime/hooks/${t}.haicc`] = Buffer.from(text)
  const ran = []
  const jobs = []
  return {
    ran,
    jobs,
    runtime: { dir: '/x', uri: 'local/x' },
    resumed: null,
    // a job waited for: kept, the request's answer none (it waits)
    wait: job => { jobs.push(job); return null },
    read: async uri => { if (!files[uri]) throw new Error('none'); return files[uri] },
    // the rest of an execution context, standing in: a file that may not
    // be there, the log (kept: entries), a step run as it is
    find: async function (p) { try { return await this.read(p) } catch { return null } },
    log: function (level, event, data = {}) { (this.entries ??= []).push({ level, event, ...data }) },
    step: async function (event, data, fn, level = 'verbose') { const r = await fn(); (this.entries ??= []).push({ level, event, ...(typeof data === 'function' ? data(r) : data) }); return r },
    put: (uri, bytes) => { files[uri] = Buffer.from(bytes) },
    select: async pattern => Object.keys(files).filter(p => p.startsWith(pattern.slice(0, -1))).map(p => [p, {}]),
    run: async (command, opts) => { if (command[0] === 'fail/now') throw new Error('refused'); ran.push([command.join(' '), opts]) }
  }
}

test('the actions: the state moved, booted to started and back', async (t) => {
  const exec = context('booted')
  t.alike(await initialise(exec), { service: 'initialised', state: 'initialised' }, 'the answer: what was done, and the state now')
  t.alike(await start(exec), { service: 'started', state: 'started' })
  t.is((await stateOf(exec)).state, 'started', 'written')
  t.alike(await stop(exec), { service: 'stopped', state: 'initialised' }, 'stopped: back to initialised')
  t.alike(await shutdown(exec), { service: 'shut down', state: 'booted' }, 'shut down: back to booted')
  t.alike(exec.ran, [], 'no hooks dropped in: none run')
})

test('the hooks: a transition with a hook file waits for its lines, then, resumed, moves the state; a line that failed fails it', async (t) => {
  const exec = context('booted', { initialise: '# made ready\ninfo/extract\n', start: 'protocol/activate . boot\n' })
  t.is(await initialise(exec), null, 'initialise: its hook file there: the request waits for its lines')
  t.alike([exec.jobs.length, (await stateOf(exec)).state], [1, 'booted'], 'one job, its lines through the mrepo\'s own inbox; the state not moved yet')
  const resumed = { ...exec, resumed: { output: [{ line: 'info/extract', output: {} }] } }
  t.alike(await initialise(resumed), { service: 'initialised', state: 'initialised' }, 'resumed: the state moved, the answer as ever')
  t.is(await start(exec), null, 'start: waits for its hook too')
  await t.exception(start({ ...exec, resumed: { error: 'line 1: protocol/activate . boot: refused' } }), /hook start: line 1: protocol\/activate \. boot: refused/, 'resumed with a failure: the transition fails, the line said')
  t.is((await stateOf(exec)).state, 'initialised', 'the state not moved')
  t.alike(await stop(exec), { service: 'stopped', state: 'initialised', again: true }, 'no hook file for stop: no wait; on an initialised service, a repeat: allowed, the state as it is')
})

test('idempotent: a transition repeated in the state it leads to (or past it) runs its hook again, warns, the state as it is', async (t) => {
  const exec = context('started', { initialise: 'info/extract\n' })
  t.is(await initialise(exec), null, 'initialise on a started service: its hook run again, waited for')
  const resumed = { ...exec, resumed: { output: [{ line: 'info/extract', output: {} }] } }
  t.alike(await initialise(resumed), { service: 'initialised', state: 'started', again: true }, 'resumed: a repeat, said; the state as it is, started')
  t.ok(resumed.entries.some(e => e.level === 'warn' && e.event === 'again' && e.transition === 'initialise' && e.state === 'started'), 'a warning in its log')
  t.alike(await start(exec), { service: 'started', state: 'started', again: true }, 'start on a started service: a repeat')
  const booted = context('booted')
  t.alike(await shutdown(booted), { service: 'shut down', state: 'booted', again: true }, 'shutdown on a booted service: a repeat')
  t.is((await stateOf(exec)).state, 'started', 'nothing moved')
})

