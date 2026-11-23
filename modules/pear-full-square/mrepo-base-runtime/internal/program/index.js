// program: a package's program run beside an mrepo, as its own process:
// where its bundle is, its state read, started, ended (README.md beside it).
import os from 'bare-os'
import process from 'bare-process'
import { spawnSync } from 'bare-subprocess'
import { existsSync, readFileSync, rmSync } from 'bare-fs'
import { join } from 'bare-path'

// A path in the mrepo's folder: names of letters, digits, dots, hyphens
// and underscores, one after the other; never up, never absolute.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// The package's bundle and its program's state, by the path given: the
// bundle at <dir>/<path>.bundle, its state beside it, <path>.state.json.
export function programAt (dir, path) {
  if (path === undefined || path === '') throw new Error('missing argument: package')
  const names = String(path).replace(/\.bundle$/, '').split('/')
  if (!names.every(n => NAME.test(n) && n !== '..')) throw new Error(`not a package in the mrepo's folder: ${path} (<folder>/<org>/<package>)`)
  const at = names.join('/')
  return { path: at, bundle: join(dir, `${at}.bundle`), state: join(dir, `${at}.state.json`) }
}

// catch: no such process: not alive
export const alive = pid => { try { os.kill(pid, 0); return true } catch { return false } }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

// Its state as the program wrote it; null when none runs (no state, or one
// left by a process that is gone).
export function stateOf (file) {
  if (!existsSync(file)) return null
  let state = null
  // catch: not whole or not JSON: no state to go by
  try { state = JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  return Number.isInteger(state?.pid) && alive(state.pid) ? state : null
}

// The program started as its own process, through the shell (it outlives
// the request that started it), and waited for until it has written its
// state. It is handed the mrepo's folder, the runtime it ends with and
// the file its state goes in. -> its state; null when it did not come up.
export async function launch ({ bundle, dir, state, runtime = process.pid, bare = process.execPath, wait = 10000 }) {
  rmSync(state, { force: true })
  const args = [bundle, `--dir=${dir}`, `--runtime=${runtime}`, `--state=${state}`]
  const r = spawnSync('sh', ['-c', 'if command -v setsid >/dev/null 2>&1; then setsid "$@" </dev/null >/dev/null 2>&1 & else "$@" </dev/null >/dev/null 2>&1 & fi', 'sh', bare, ...args], { stdio: 'ignore' })
  if (r.status !== 0) return null
  // time: the wait for its state, bounded
  for (const until = Date.now() + wait; Date.now() < until;) {
    await pause(100)
    const s = stateOf(state)
    if (s) return s
  }
  return null
}

// The program ended, waited for until its process has ended: SIGTERM, then
// SIGKILL. -> { pid, how }; null when none was running.
export async function end (state, { wait = 5000 } = {}) {
  const s = stateOf(state)
  if (!s) { rmSync(state, { force: true }); return null }
  const ended = async ms => { for (let i = 0; i < ms / 50 && alive(s.pid); i++) await pause(50); return !alive(s.pid) }
  let how = 'SIGTERM'
  // catch: ended meanwhile: nothing to signal
  try { os.kill(s.pid, 'SIGTERM') } catch {}
  if (!await ended(wait)) {
    how = 'SIGKILL'
    // catch: ended meanwhile: nothing to signal
    try { os.kill(s.pid, 'SIGKILL') } catch {}
    if (!await ended(2000)) throw new Error(`its program did not end: pid ${s.pid}`)
  }
  rmSync(state, { force: true })
  return { pid: s.pid, how }
}
