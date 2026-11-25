// A command sent on: a request whose position is a shortcut is not executed
// here. The command that follows is sent to the mrepo linked there, as it
// is, and its response becomes this request's result.
//   pass(ctx, name, core, to, command, flags)
//     to        where it leads (mrepo-base-xpath's resolve): { at, mrepo,
//               folder, dir }: the linked mrepo's unique URI and its folder
//     command   the command sent on, its parts, unchanged
//     flags     the flags in force here: they go with it (a flag holds
//               through a chain until changed)
//     the child request issued: its value the command (with flags: the
//     command and they, { command, flags }); its core addressed
//     back to this request's own branch (/<this mrepo>/execute/<key>);
//     delivered into the linked mrepo's inbox folder (the same node:
//     direct; another node needs dispatch, not built)
//     -> the request's form with what it waits for: remote { at, folder,
//        offset }: the child's offset, at the linked mrepo
import { existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { record, drop } from 'mrepo-base-request'

export function pass (ctx, name, core, to, command, flags = {}) {
  if (!to?.dir || !existsSync(join(to.dir, 'inbox'))) throw new Error(`not reachable: ${to?.at} (no inbox at ${to?.dir})`)
  const child = record(`/${ctx.uri ?? ctx.name}/execute/${name}`, Object.keys(flags).length ? { command, flags } : command)
  // dropped as everyone drops a record: its offset the linked mrepo's
  const offset = drop(to.dir, to.mrepo, child)
  return { ...core.value, remote: { at: to.at, folder: to.folder, offset } }
}
