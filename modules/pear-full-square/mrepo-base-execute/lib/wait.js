// A job waited for: an action parks its request until an outside job ends
// (exec.wait), the runtime free meanwhile to execute other requests, such
// as the commands the job itself sends in. The job's result is written as
// a completed record into the mrepo's own waiting/outbox/<key>.json, where
// the runtime collects it as it collects a linked mrepo's response; the
// action is then executed again with it, form.resumed: { output } or
// { error }.
//   park(ctx, name, core, job)
//     job       an async function, run outside the execution
//     -> the request's form with what it waits for: remote { at, folder,
//        key, resume }
import { mkdirSync, writeFileSync } from 'bare-fs'
import { join } from 'bare-path'
import { record, wrap, guid, complete } from 'mrepo-base-request'

export const WAITING = 'waiting'

export function park (ctx, name, core, job) {
  if (!ctx.dir) throw new Error('no folder to wait in')
  const key = guid()
  const child = record(`/${ctx.uri ?? ctx.name}/execute/${name}`, { wait: name }, key)
  const out = join(ctx.dir, WAITING, 'outbox')
  mkdirSync(out, { recursive: true })
  // its result, or what failed, written when it ends: the record collected
  Promise.resolve()
    .then(job)
    .then(value => ({ ok: true, value: value ?? null }), err => ({ ok: false, error: err.message }))
    .then(result => writeFileSync(join(out, `${key}.json`), JSON.stringify(wrap('/outbox', complete(child, result))) + '\n'))
  return { ...core.value, remote: { at: '.', folder: WAITING, key, resume: true } }
}
