// A booted repository for the tests: the repository `host`, its layers, its
// packages manifest (none linked: the tests' runtime, test/runtime.js, is
// given the crud, service and protocol protocols), its service state booted,
// its hooks (service active from boot; crud behind the service's door:
// activated by its start, deactivated by its stop), the pending queue
// preloaded with service initialise /. Without a setup: written directly. On the p2p
// layer (as haicc-base-boot leaves the host) or on native git (storage:
// 'git': a bare repository, <work>/mrepos/host/.git, and <work>/mrepo.json).
// And an input's request, as HAICC's input sends it, its answer read.
import fs, { writeFileSync, mkdirSync } from 'bare-fs'
import { join } from 'bare-path'
import { openStore } from 'p2p-store'
import { mrepos } from 'p2p-mrepo'
import { writer, openRepo, nativeBackend, p2pgitBackend } from 'mycelium-git'
import { record, wrap, tick, nameOf, layer, post, inboxFolder, setting, gitdirOf, PENDING } from 'mrepo-base-request'

const author = { name: 'test', email: 'test@localhost' }
// The hooks, as a defining package would drop them into the runtime layer.
export const HOOKS = {
  boot: 'protocol/activate . service\n',
  start: 'protocol/activate . crud\n',
  stop: 'protocol/deactivate . crud\n'
}
async function layers (backend, { preload, hooks = true, more = {} }) {
  const w = writer(backend)
  for (const l of ['main', 'packages', 'runtime', 'protocols', 'inbox', 'outbox', 'request/pending/default', 'request/execute', 'request/done', 'xpath/log']) await w.createLayer(l, `Create ${l}`, { author })
  // (the streaming layers: each declares its structure, as its package's
  // config does: a layer that declares none is a folder)
  for (const l of ['inbox', 'outbox', 'request/done', 'xpath/log']) {
    const x = await w.change(l)
    await x.put('/.layer.json', Buffer.from(JSON.stringify({ mode: 'non-atomic', description: `The ${l}.`, structure: { type: 'offset-files', levels: [5, 6], batch: 50 } })))
    await x.commit('Configured', { author })
  }
  const p = await w.change('packages')
  await p.put('/manifest.json', Buffer.from(JSON.stringify({ packages: {} })))
  await p.commit('Installed', { author })
  const r = await w.change('runtime')
  await r.put('/service.json', Buffer.from(JSON.stringify({ state: 'booted' })))
  // (hooks: false: none, where no runtime runs their lines: an execution in this process)
  if (hooks) for (const [t, text] of Object.entries({ ...HOOKS, ...more })) await r.put(`/hooks/${t}.haicc`, Buffer.from(text))
  await r.commit('Booted', { author })
  if (preload) {
    const q = await w.change(PENDING)
    const core = record(null, { protocol: 'service', action: 'initialise', uri: ['.'] }, tick())
    await q.put(`/${nameOf(core.offset)}.json`, Buffer.from(JSON.stringify(wrap(`/${PENDING}`, core))))
    await q.commit('Preloaded', { author })
  }
}

// more: hooks besides, by transition (a commission, a decommission)
export async function bootedHost (work, { preload = true, storage = 'p2p', hooks = true, more = {} } = {}) {
  if (storage === 'git') {
    writeFileSync(join(work, 'mrepo.json'), JSON.stringify({ storage: 'git', name: 'host' }) + '\n')
    const backend = nativeBackend(gitdirOf(work, 'host'))
    await backend.init()
    await layers(backend, { preload, hooks, more })
    return { name: 'host', id: null }
  }
  const store = await openStore({ storage: join(work, 'store') })
  try {
    const host = await mrepos({ store, local: join(work, 'mrepos') }).create('host')
    await layers(host.backend, { preload, hooks, more })
    return host
  } finally { await store.close() }
}

// A request, as HAICC's input sends it (the form in an envelope addressed to
// the repository's inbox; native git: committed; p2p: a file in the inbox
// folder), the completed form read from the outbox layer: { ok, value } (its
// output) or { ok: false, error }; null when none came. formOf: the record.
export async function sendForm (work, form, { wait = 10000, to } = {}) {
  const { storage, name } = setting(work)
  const disk = storage === 'git' ? nativeBackend(gitdirOf(work, name)) : p2pgitBackend(gitdirOf(work, name), { fs })
  // a form, or a command as typed (a string, an array of parts)
  const core = record('/haicc/terminal', typeof form === 'string' || Array.isArray(form) ? form : { ...form })
  // its offset given as it arrives: on git alone, by the post; else by the
  // inbox folder, as everyone drops a record
  let id
  if (storage === 'git') [id] = await post({ work, backend: disk, writer: writer(disk), repo: openRepo(disk) }, wrap(to ?? `/${name}/inbox`, core))
  else id = nameOf(inboxFolder(work).create(offset => wrap(to ?? `/${name}/inbox`, { ...core, offset })))
  const repo = openRepo(disk)
  for (const end = Date.now() + wait; Date.now() < end;) {
    const back = await layer({ repo }, 'outbox').read(id).catch(() => null)
    if (back) return back.value
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return null
}
export async function send (work, form, opts) {
  const core = await sendForm(work, form, opts)
  if (!core) return null
  return 'output' in core.value ? { ok: true, value: core.value.output } : { ok: false, error: core.value.error }
}

// The configs of the protocols these tests run, as their packages give them
// (a module carries no config: the package does), for a context written
// for the tests: the service with its states, the protocol protocol, crud.
const at = states => ({ uris: ['.'], states })
export const PROTOCOLS = {
  service: {
    description: 'The service, for the tests.',
    actions: { initialise: at(['booted']), start: at(['initialised']), stop: at(['started']), shutdown: at(['initialised']) }
  },
  protocol: {
    description: 'The protocol protocol, for the tests.',
    actions: { activate: { uris: ['.'], args: ['protocol'] }, deactivate: { uris: ['.'], args: ['protocol'] } }
  },
  crud: {
    description: 'crud, for the tests.',
    actions: { create: { uris: ['**'], target: true, args: ['value?'] }, read: { uris: ['**'] }, delete: { uris: ['**'], target: true, args: ['recurse?'] } }
  }
}
