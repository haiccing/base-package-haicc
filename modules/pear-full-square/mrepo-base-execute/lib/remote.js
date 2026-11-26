// A command sent on: a request whose position is a shortcut is not executed
// here. The command that follows is sent to the mrepo linked there, as it
// is, and its response becomes this request's result.
//   pass(ctx, name, request, to, command, flags)
//     to        where it leads (mrepo-base-xpath's resolve): { at, mrepo,
//               folder, dir }: the linked mrepo's unique URI and its folder
//     command   the command sent on, its words
//     flags     the flags in force here: those that hold down a chain go
//               with it, written into its line
//     the child request asked: its line the command; from this mrepo, for
//     the linked one, its answer to this request's own branch
//     (/<this mrepo>/execute/<key>), its origin this request's offset;
//     dropped into the linked mrepo's inbox folder (the same node: direct;
//     another node needs dispatch)
//     -> what the request waits for: { at, folder, offset, resume: false }:
//        the child's offset, at the linked mrepo
import { existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { asked, drop, carrying, lineOf } from 'mrepo-base-request'

export function pass (ctx, name, request, to, command, flags = {}) {
  if (!to?.dir || !existsSync(join(to.dir, 'inbox'))) throw new Error(`not reachable: ${to?.at} (no inbox at ${to?.dir})`)
  const here = ctx.uri ?? ctx.name
  const child = asked(lineOf(carrying(command, flags, ctx.protocols ?? {})), { from: here, to: to.mrepo, reply: `/${here}/execute/${name}`, origin: Number(name) })
  // dropped as everyone drops a request: its offset the linked mrepo's
  const offset = drop(to.dir, to.mrepo, child)
  return { at: to.at, folder: to.folder, offset, resume: false }
}
