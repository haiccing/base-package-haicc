// A job waited for: an action parks its request until an outside job ends
// (exec.wait), the runtime free meanwhile to execute other requests, such
// as the commands the job itself sends in. What the job returns is written
// as a request returned into the mrepo's own waiting/outbox, under an
// offset of the mrepo's (a streaming folder, as a linked mrepo's outbox),
// where the runtime collects it as it collects a linked mrepo's answer;
// the action is then executed again with it, exec.resumed: { status,
// message, attachments }.
//   park(ctx, name, request, job)
//     job       an async function, run outside the execution: -> what it
//               says happened, as an action says it (a text, or { message,
//               attachments }); what it throws: failed, its message
//     -> what the request waits for: { at, folder, offset, resume: true }
import { join } from 'bare-path'
import { record, filled, returned, offsetOf, outboxOf } from 'mrepo-base-request'

export const WAITING = 'waiting'

export function park (ctx, name, request, job) {
  if (!ctx.dir) throw new Error('no folder to wait in')
  const offset = offsetOf(ctx)
  const here = ctx.uri ?? ctx.name
  // the job's own request: the same command, for this request's branch
  const child = { ...filled(request.form, { from: here, to: here, reply: `/${here}/execute/${name}`, origin: Number(name) }), command: request.command }
  const out = outboxOf(join(ctx.dir, WAITING))
  const say = v => (typeof v === 'string' ? { message: v, attachments: [] } : { message: v?.message, attachments: v?.attachments ?? [] })
  // what it returns, or what failed, written when it ends: collected
  Promise.resolve()
    .then(job)
    .then(v => { const { message, attachments } = say(v); return returned(child, 'done', message, attachments) })
    .catch(err => returned(child, 'failed', err.message))
    .then(r => out.put(offset, record('/outbox', r, offset)))
  return { at: '.', folder: WAITING, offset, resume: true }
}
