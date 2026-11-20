/**
 * Host-half regression test: drives the RPC route over real HTTP with a mocked
 * Cordis context and a temporary harness home.
 *
 * Run with `node test/host.test.mjs`.
 */
import http from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '.runtime')
const HOME = join(ROOT, 'home')
const AGENTS = join(ROOT, 'agents')
const PROJECT = join(ROOT, 'project')

process.env.DSH_HOME = HOME
process.env.DSH_AGENTS_HOME = AGENTS

await rm(ROOT, { recursive: true, force: true })
await mkdir(join(HOME, 'storages'), { recursive: true })
await mkdir(AGENTS, { recursive: true })
await mkdir(PROJECT, { recursive: true })
await writeFile(join(PROJECT, 'AGENTS.md'), '# project rules\n', 'utf8')
await writeFile(join(HOME, 'AGENTS.md'), '# global rules\n', 'utf8')
await writeFile(join(HOME, 'storages', 'workspace.json'), JSON.stringify({
  tables: { workspaces: { w1: { path: PROJECT, title: 'Demo' } } },
  global: { workspaceIds: ['w1'] },
}), 'utf8')

let routes = []

/**
 * Build a Cordis context mock around one workspace registry (or none).
 * @param registry - the registry service, or undefined to exercise the storage fallback.
 * @returns the mock context.
 */
function makeContext(registry) {
  return {
    effect(fn) {
      const dispose = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    webServer: { register(route) { routes.push(route); return () => {} } },
    get(name) { return name === 'workspaceRegistry' ? registry : undefined },
  }
}

apply(makeContext(undefined))

const server = http.createServer((req, res) => routes[0].handler(req, res))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

/**
 * Call one Host operation.
 * @param method - operation name.
 * @param args - operation payload.
 * @returns the operation value; throws with `code` on failure.
 */
async function rpc(method, args) {
  const response = await fetch(`http://127.0.0.1:${port}/dsh-rules-manager/api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const body = await response.json()
  if (!body.ok) {
    const failure = new Error(`${body.error.code}: ${body.error.message}`)
    failure.code = body.error.code
    throw failure
  }
  return body.value
}

const fallback = await rpc('snapshot')
console.log('fallback projects:', fallback.projects.map((project) => `${project.title}:${project.path}`))

routes = []
apply(makeContext({ list: () => [{ id: 'abc', path: PROJECT, title: 'Demo registry' }] }))

const snapshot = await rpc('snapshot')
console.log('global:', snapshot.global.map((item) => `${item.key} exists=${item.exists} size=${item.size}`))
console.log('projects:', snapshot.projects.map((project) => `${project.title} files=${project.files.map((file) => `${file.name}:${file.exists}`).join(',')}`))

const read = await rpc('read', { target: { scope: 'project', path: PROJECT, name: 'AGENTS.md' } })
console.log('read content:', JSON.stringify(read.content))

const written = await rpc('write', { target: { scope: 'project', path: PROJECT, name: 'AGENTS.local.md' }, content: 'local overlay\n' })
console.log('written:', written.exists, written.size)

const created = await rpc('write', { target: { scope: 'global', key: 'agents', name: 'AGENTS.md' }, content: 'shared\n' })
console.log('created shared:', created.exists)

const removed = await rpc('remove', { target: { scope: 'global', key: 'agents', name: 'AGENTS.md' } })
console.log('removed shared:', removed.exists)

const added = await rpc('addProject', { path: PROJECT })
console.log('addProject:', added.path)
const removedProject = await rpc('removeProject', { path: PROJECT })
console.log('removeProject:', removedProject.path)
const settings = JSON.parse(await readFile(join(HOME, 'rules-manager.json'), 'utf8'))
console.log('settings projects:', settings.projects)

let rejected = 0
for (const bad of [
  { scope: 'project', path: 'relative/dir', name: 'AGENTS.md' },
  { scope: 'project', path: PROJECT, name: '../AGENTS.md' },
  { scope: 'project', path: PROJECT, name: 'notes.txt' },
  { scope: 'global', key: 'nope', name: 'AGENTS.md' },
  { scope: 'nope' },
]) {
  try {
    await rpc('read', { target: bad })
    throw new Error(`accepted an invalid target: ${JSON.stringify(bad)}`)
  } catch (error) {
    if (error.code !== 'invalid-target') throw error
    rejected += 1
  }
}
console.log('rejected invalid targets:', rejected)

try {
  await rpc('addProject', { path: join(ROOT, 'missing') })
  throw new Error('accepted a missing directory')
} catch (error) {
  if (error.code !== 'not-a-directory') throw error
  console.log('addProject missing ->', error.code)
}

const badMethod = await fetch(`http://127.0.0.1:${port}/dsh-rules-manager/api/rpc`, { method: 'GET' })
console.log('GET status:', badMethod.status)
if (badMethod.status !== 405) throw new Error('GET was not rejected')

server.close()
await rm(ROOT, { recursive: true, force: true })
console.log('HOST_OK')
