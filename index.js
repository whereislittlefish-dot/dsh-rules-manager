/**
 * `dsh-rules-manager` — Host half.
 *
 * One fenced RPC route over the rule files DSH itself loads as workspace
 * instructions: the user-global `AGENTS.md` under the harness home, the shared
 * agents home's `AGENTS.md`, and every project's `AGENTS.md`, `CLAUDE.md`,
 * `AGENTS.local.md` and `CLAUDE.local.md`.
 *
 * The browser half never sends a raw filesystem path to write: it names a
 * scope (global file, or one project directory plus one candidate filename),
 * and this route maps that target back onto the allowed locations before
 * touching disk.
 */

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** The one HTTP route this plugin owns. */
const ROUTE_PATH = '/dsh-rules-manager/api/rpc'

/** Candidate rule filenames inside a project directory, in loading order. */
const RULE_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md'])

/** Largest rule file the page reads into its editor. */
const MAX_READ_BYTES = 1024 * 1024

/** Largest content the page may write back. */
const MAX_WRITE_BYTES = 4 * 1024 * 1024

/** Largest accepted RPC body. */
const MAX_BODY_BYTES = 6 * 1024 * 1024

/** Plugin-owned settings file under the harness home. */
const SETTINGS_FILE = 'rules-manager.json'

/** Directory, under the harness home, that holds automatic rule backups. */
const BACKUP_DIR_NAME = 'rule-backups'

/** How many backups one rule file keeps; older ones are pruned. */
const MAX_BACKUPS_PER_TARGET = 50

/** Largest rule file the plugin copies into the backup directory. */
const MAX_BACKUP_BYTES = 4 * 1024 * 1024

/**
 * Raise one failure the browser can present by code.
 */
class RulesError extends Error {
  /**
   * @param code - stable failure code the browser translates.
   * @param message - operator-facing detail.
   */
  constructor(code, message) {
    super(message)
    this.name = 'RulesError'
    this.code = code
  }
}

/**
 * Expand a leading `~`, `~/`, or `~\` against the operating-system home.
 * @param input - user-supplied path.
 * @returns the path with a supported tilde prefix expanded.
 */
function expandTilde(input) {
  if (input === '~') return homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) return join(homedir(), input.slice(2))
  return input
}

/**
 * The harness home: `$DSH_HOME` when set, otherwise `~/.dsh`.
 * @returns the absolute harness home.
 */
function harnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(expandTilde(configured.trim()))
  return join(homedir(), '.dsh')
}

/**
 * The shared agents root: `$DSH_AGENTS_HOME` when set, otherwise `~/.agents`.
 * @returns the absolute shared agents root.
 */
function agentsHome() {
  const configured = process.env.DSH_AGENTS_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(expandTilde(configured.trim()))
  return join(homedir(), '.agents')
}

/**
 * Case-folding key for path identity. Windows paths compare case-insensitively;
 * other platforms keep the exact spelling.
 * @param path - absolute path.
 * @returns the comparison key.
 */
function pathKey(path) {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Describe one file without following it into a directory.
 * @param path - absolute file path.
 * @returns existence, byte size, and ISO modification time.
 */
async function describeFile(path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return { exists: false, size: 0, mtime: null }
    return { exists: true, size: info.size, mtime: info.mtime.toISOString() }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, size: 0, mtime: null }
    throw error
  }
}

/**
 * Whether a path currently names a directory.
 * @param path - absolute path.
 * @returns true when the path exists and is a directory.
 */
async function isDirectory(path) {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Read this plugin's own settings file.
 * @returns the known project directories.
 */
async function readSettings() {
  const file = join(harnessHome(), SETTINGS_FILE)
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    const projects = Array.isArray(parsed?.projects) ? parsed.projects : []
    return {
      projects: projects
        .filter((item) => typeof item === 'string' && item.trim() !== '')
        .map((item) => resolve(expandTilde(item.trim()))),
    }
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return { projects: [] }
    throw error
  }
}

/**
 * Persist this plugin's settings atomically.
 * @param settings - the settings object to write.
 */
async function writeSettings(settings) {
  const file = join(harnessHome(), SETTINGS_FILE)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ version: 1, projects: settings.projects }, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
}

/**
 * Project directories from the workspace registry, or the stored workspace
 * document when no registry service is composed.
 * @param ctx - the plugin context.
 * @returns workspace-sourced projects, first registered first.
 */
async function workspaceEntries(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      const list = registry.list()
      if (Array.isArray(list)) {
        return list
          .filter((workspace) => typeof workspace?.path === 'string' && workspace.path !== '')
          .map((workspace) => ({
            id: `workspace:${String(workspace.id ?? workspace.path)}`,
            title: String(workspace.title ?? basename(workspace.path) ?? workspace.path),
            path: String(workspace.path),
            source: 'workspace',
          }))
      }
    } catch {
      /* a registry fault falls through to the stored document */
    }
  }
  return storedWorkspaceEntries()
}

/**
 * Read project directories straight from the workspace storage document.
 * @returns stored projects in display order.
 */
async function storedWorkspaceEntries() {
  const file = join(harnessHome(), 'storages', 'workspace.json')
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    const table = parsed?.tables?.workspaces
    if (table === null || typeof table !== 'object') return []
    const declared = Array.isArray(parsed?.global?.workspaceIds) ? parsed.global.workspaceIds : []
    const ordered = [
      ...declared.filter((id) => Object.hasOwn(table, id)),
      ...Object.keys(table).filter((id) => !declared.includes(id)),
    ]
    return ordered
      .map((id) => {
        const record = table[id] ?? {}
        const path = String(record.path ?? '')
        return {
          id: `workspace:${String(record.id ?? id)}`,
          title: String(record.title ?? (path === '' ? id : basename(path))),
          path,
          source: 'workspace',
        }
      })
      .filter((entry) => entry.path !== '')
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return []
    throw error
  }
}

/**
 * Every project the page lists: registered workspaces first, then directories
 * the user added by hand, de-duplicated by canonical spelling.
 * @param ctx - the plugin context.
 * @returns ordered project entries.
 */
async function projectEntries(ctx) {
  const entries = []
  const seen = new Set()
  const push = (entry) => {
    if (typeof entry.path !== 'string' || entry.path.trim() === '') return
    const key = pathKey(entry.path)
    if (seen.has(key)) return
    seen.add(key)
    entries.push({ ...entry, path: resolve(entry.path) })
  }
  for (const entry of await workspaceEntries(ctx)) push(entry)
  for (const path of (await readSettings()).projects) {
    push({ id: `custom:${pathKey(path)}`, title: basename(path) || path, path, source: 'custom' })
  }
  return entries
}

/**
 * Resolve one page target onto an allowed rule-file location.
 * @param target - the browser's scope + identity payload.
 * @returns the absolute path and the target's own labels.
 */
function resolveTarget(target) {
  if (target === null || typeof target !== 'object') throw new RulesError('invalid-target', '缺少要操作的规则文件。')
  if (target.scope === 'global') {
    if (target.key === 'dsh') {
      return { scope: 'global', key: 'dsh', name: 'AGENTS.md', path: join(harnessHome(), 'AGENTS.md') }
    }
    if (target.key === 'agents') {
      return { scope: 'global', key: 'agents', name: 'AGENTS.md', path: join(agentsHome(), 'AGENTS.md') }
    }
    throw new RulesError('invalid-target', '未知的全局规则位置。')
  }
  if (target.scope === 'project') {
    const raw = typeof target.path === 'string' ? target.path.trim() : ''
    const name = typeof target.name === 'string' ? target.name.trim() : ''
    if (raw === '' || !isAbsolute(raw)) throw new RulesError('invalid-target', '项目路径必须是绝对路径。')
    if (!RULE_FILES.includes(name)) throw new RulesError('invalid-target', `不支持的规则文件名：${name || '（空）'}`)
    const directory = resolve(raw)
    return { scope: 'project', path: join(directory, name), directory, name }
  }
  throw new RulesError('invalid-target', '未知的规则范围。')
}

/**
 * Root directory holding automatic rule backups.
 * @returns the absolute backup root.
 */
function backupRoot() {
  return join(harnessHome(), BACKUP_DIR_NAME)
}

/**
 * Make one filesystem-safe path segment from a user-facing name.
 * @param value - raw name.
 * @param fallback - segment used when nothing usable remains.
 * @returns the sanitized segment.
 */
function safeSegment(value, fallback) {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
  return cleaned.slice(0, 40) || fallback
}

/**
 * Local-time stamp used in backup file names: `YYYYMMDD-HHmmss-SSS`.
 * @param date - instant to format.
 * @returns the filename stamp.
 */
function localStamp(date) {
  const pad = (value, width = 2) => String(value).padStart(width, '0')
  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    pad(date.getMilliseconds(), 3),
  ].join('-')
}

/**
 * Directory name for one target's backups, readable in a file manager.
 * @param target - resolved target.
 * @returns `global-dsh`, `global-agents`, or `project-<name>-<hash>`.
 */
function targetSegment(target) {
  if (target.scope === 'global') return `global-${target.key}`
  const hash = createHash('sha1').update(pathKey(target.directory)).digest('hex').slice(0, 8)
  return `project-${safeSegment(basename(target.directory), 'dir')}-${hash}`
}

/**
 * Human-readable label stored beside each backup.
 * @param target - resolved target.
 * @returns a neutral label naming the rule and its owner.
 */
function targetLabel(target) {
  if (target.scope === 'global') {
    return `${target.key === 'dsh' ? 'user-global' : 'shared-agents'} · ${target.name}`
  }
  return `${basename(target.directory) || target.directory} · ${target.name}`
}

/**
 * Absolute backup directory for one target.
 * @param target - resolved target.
 * @returns the absolute directory.
 */
function backupDirectory(target) {
  return join(backupRoot(), targetSegment(target))
}

/**
 * Keep only the newest backups of one target.
 * @param directory - the target's backup directory.
 */
async function pruneBackups(directory) {
  let names
  try {
    names = await readdir(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  const backups = names.filter((name) => name.endsWith('.bak')).sort()
  const excess = backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS_PER_TARGET))
  for (const name of excess) {
    await unlink(join(directory, name)).catch(() => {})
    await unlink(join(directory, `${name}.json`)).catch(() => {})
  }
}

/**
 * Recover the creation instant from a backup file name.
 * @param name - backup file name.
 * @returns ISO instant, or null when the name carries no stamp.
 */
function stampFromName(name) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})/.exec(name)
  if (match === null) return null
  const [, year, month, day, hour, minute, second, millisecond] = match
  return new Date(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second), Number(millisecond),
  ).toISOString()
}

/**
 * Copy the current content of one target into its backup directory.
 * @param target - resolved target.
 * @param reason - `save`, `delete`, or `restore`.
 * @returns the created backup, a `{ skipped }` marker, or null when the file is absent.
 */
async function backupBefore(target, reason) {
  const current = await describeFile(target.path)
  if (!current.exists) return null
  if (current.size > MAX_BACKUP_BYTES) return { skipped: 'too-large', size: current.size }
  const directory = backupDirectory(target)
  await mkdir(directory, { recursive: true })
  const createdAt = new Date()
  const base = `${localStamp(createdAt)}__${safeSegment(target.name, 'rules')}`
  let id = `${base}.bak`
  let suffix = 0
  while ((await describeFile(join(directory, id))).exists) {
    suffix += 1
    id = `${base}-${suffix}.bak`
  }
  const content = await readFile(target.path)
  await writeFile(join(directory, id), content)
  const meta = {
    version: 1,
    target: {
      scope: target.scope,
      ...(target.scope === 'global' ? { key: target.key } : { directory: target.directory }),
      name: target.name,
    },
    path: target.path,
    label: targetLabel(target),
    createdAt: createdAt.toISOString(),
    size: content.length,
    reason,
  }
  await writeFile(join(directory, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  await pruneBackups(directory)
  return { id, createdAt: meta.createdAt, size: content.length, reason, label: meta.label }
}

/**
 * Validate one backup identifier coming from the browser.
 * @param value - candidate id.
 * @returns the id.
 */
function backupId(value) {
  if (typeof value !== 'string' || !/^\d{8}-\d{6}-\d{3}__[A-Za-z0-9._-]+\.bak$/.test(value)) {
    throw new RulesError('invalid-backup', '备份标识无效。')
  }
  return value
}

/**
 * List one target's backups, newest first.
 * @param args - `{ target }`.
 * @returns the backup directory, entries, and the retention cap.
 */
async function listBackups(args) {
  const target = resolveTarget(args?.target)
  const directory = backupDirectory(target)
  let names = []
  try {
    names = await readdir(directory)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const files = names.filter((name) => name.endsWith('.bak')).sort().reverse()
  const items = []
  for (const name of files) {
    const file = join(directory, name)
    const info = await describeFile(file)
    if (!info.exists) continue
    let meta = null
    try {
      meta = JSON.parse(await readFile(`${file}.json`, 'utf8'))
    } catch {
      /* a backup without sidecar metadata still restores */
    }
    items.push({
      id: name,
      createdAt: typeof meta?.createdAt === 'string' ? meta.createdAt : stampFromName(name),
      size: info.size,
      reason: typeof meta?.reason === 'string' ? meta.reason : 'save',
      label: typeof meta?.label === 'string' ? meta.label : targetLabel(target),
    })
  }
  return { directory, items: items.sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')) || right.id.localeCompare(left.id)), max: MAX_BACKUPS_PER_TARGET }
}

/**
 * Replace one target with a chosen backup, copying the current content first.
 * @param args - `{ target, id }`.
 * @returns the restored file state plus backup warnings.
 */
async function restoreBackup(args) {
  const target = resolveTarget(args?.target)
  const id = backupId(args?.id)
  const file = join(backupDirectory(target), id)
  const backupInfo = await describeFile(file)
  if (!backupInfo.exists) throw new RulesError('backup-missing', `备份不存在：${id}`)
  if (backupInfo.size > MAX_BACKUP_BYTES) throw new RulesError('too-large', '备份文件过大，未恢复。')
  const content = await readFile(file, 'utf8')
  const warnings = []
  try {
    await backupBefore(target, 'restore')
  } catch (error) {
    warnings.push(`backup-failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  await mkdir(dirname(target.path), { recursive: true })
  await writeFile(target.path, content, 'utf8')
  return { ...target, content, ...(await describeFile(target.path)), warnings }
}

/**
 * Describe one global file.
 * @param key - `dsh` or `agents`.
 * @param path - absolute file path.
 * @returns the snapshot row.
 */
async function describeGlobal(key, path) {
  return { key, name: 'AGENTS.md', path, scope: 'global', ...(await describeFile(path)) }
}

/**
 * Describe one project and its candidate files.
 * @param entry - a project entry from {@link projectEntries}.
 * @returns the snapshot row.
 */
async function describeProject(entry) {
  const exists = await isDirectory(entry.path)
  const files = []
  for (const name of RULE_FILES) {
    const path = join(entry.path, name)
    const info = exists ? await describeFile(path) : { exists: false, size: 0, mtime: null }
    files.push({ name, path, scope: 'project', ...info })
  }
  return { ...entry, exists, files }
}

/**
 * The page's complete list: global rule files plus every known project.
 * @param ctx - the plugin context.
 * @returns the snapshot the browser renders.
 */
async function snapshot(ctx) {
  const home = harnessHome()
  const shared = agentsHome()
  const global = [
    await describeGlobal('dsh', join(home, 'AGENTS.md')),
    await describeGlobal('agents', join(shared, 'AGENTS.md')),
  ]
  const projects = []
  for (const entry of await projectEntries(ctx)) projects.push(await describeProject(entry))
  return {
    home,
    agentsHome: shared,
    global,
    projects,
    ruleFiles: RULE_FILES,
    limits: { readBytes: MAX_READ_BYTES, writeBytes: MAX_WRITE_BYTES },
  }
}

/**
 * Read one target's content.
 * @param args - `{ target }`.
 * @returns path, existence, content, size, and modification time.
 */
async function readTarget(args) {
  const target = resolveTarget(args?.target)
  const info = await describeFile(target.path)
  if (!info.exists) return { ...target, content: '', ...info }
  if (info.size > MAX_READ_BYTES) {
    throw new RulesError('too-large', `规则文件超过 ${Math.floor(MAX_READ_BYTES / 1024)} KB，不能在面板内编辑：${target.path}`)
  }
  return { ...target, content: await readFile(target.path, 'utf8'), ...info }
}

/**
 * Write one target's content, creating the file and its directory when needed.
 * The current content is copied into the backup directory first.
 * @param args - `{ target, content }`.
 * @returns path, size, modification time, and any backup warning.
 */
async function writeTarget(args) {
  const target = resolveTarget(args?.target)
  const content = typeof args?.content === 'string' ? args.content : null
  if (content === null) throw new RulesError('invalid-content', '缺少要保存的规则内容。')
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > MAX_WRITE_BYTES) {
    throw new RulesError('too-large', `规则内容超过 ${Math.floor(MAX_WRITE_BYTES / 1024)} KB，未保存。`)
  }
  const warnings = []
  try {
    const backup = await backupBefore(target, 'save')
    if (backup?.skipped === 'too-large') warnings.push('backup-too-large')
  } catch (error) {
    warnings.push(`backup-failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  await mkdir(dirname(target.path), { recursive: true })
  await writeFile(target.path, content, 'utf8')
  return { ...target, content, ...(await describeFile(target.path)), warnings }
}

/**
 * Delete one target file, copying it into the backup directory first.
 * @param args - `{ target }`.
 * @returns path, the post-delete state, and any backup warning.
 */
async function removeTarget(args) {
  const target = resolveTarget(args?.target)
  const warnings = []
  try {
    const backup = await backupBefore(target, 'delete')
    if (backup?.skipped === 'too-large') warnings.push('backup-too-large')
  } catch (error) {
    warnings.push(`backup-failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    await unlink(target.path)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { ...target, ...(await describeFile(target.path)), warnings }
}

/**
 * Add one directory to the plugin's own project list.
 * @param args - `{ path }`.
 * @returns the canonical directory path.
 */
async function addProject(args) {
  const raw = typeof args?.path === 'string' ? args.path.trim() : ''
  if (raw === '') throw new RulesError('invalid-path', '请填写项目目录。')
  if (!isAbsolute(expandTilde(raw))) throw new RulesError('invalid-path', '项目目录必须是绝对路径。')
  const directory = resolve(expandTilde(raw))
  if (!(await isDirectory(directory))) throw new RulesError('not-a-directory', `目录不存在：${directory}`)
  const settings = await readSettings()
  const key = pathKey(directory)
  if (!settings.projects.some((item) => pathKey(item) === key)) {
    settings.projects.push(directory)
    await writeSettings(settings)
  }
  return { path: directory }
}

/**
 * Drop one directory from the plugin's own project list. Files are untouched.
 * @param args - `{ path }`.
 * @returns the removed directory path.
 */
async function removeProject(args) {
  const raw = typeof args?.path === 'string' ? args.path.trim() : ''
  if (raw === '') throw new RulesError('invalid-path', '缺少项目目录。')
  const directory = resolve(expandTilde(raw))
  const settings = await readSettings()
  const key = pathKey(directory)
  settings.projects = settings.projects.filter((item) => pathKey(item) !== key)
  await writeSettings(settings)
  return { path: directory }
}

/**
 * Write one JSON response.
 * @param res - the HTTP response.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function send(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/**
 * Read a request body with a hard byte cap.
 * @param req - the HTTP request.
 * @returns the UTF-8 body.
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new RulesError('body-too-large', '请求内容过大。')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Services this row cannot work without: the HTTP route owner. */
export const inject = ['webServer']

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'dsh-rules-manager'

/**
 * Host body: one route, one dispatch table over the rule files.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  const methods = {
    snapshot: () => snapshot(ctx),
    read: readTarget,
    write: writeTarget,
    remove: removeTarget,
    backups: listBackups,
    restore: restoreBackup,
    addProject,
    removeProject,
  }

  /**
   * Dispatch one RPC request.
   * @param req - the HTTP request.
   * @param res - the HTTP response.
   */
  async function handle(req, res) {
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: { code: 'method-not-allowed', message: '只接受 POST 请求。' } })
      return
    }
    let payload
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch (error) {
      const code = error instanceof RulesError ? error.code : 'invalid-body'
      send(res, 400, { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } })
      return
    }
    const method = payload?.method
    const operation = typeof method === 'string' && Object.hasOwn(methods, method) ? methods[method] : undefined
    if (operation === undefined) {
      send(res, 400, { ok: false, error: { code: 'unknown-method', message: `未知操作：${String(method)}` } })
      return
    }
    try {
      send(res, 200, { ok: true, value: await operation(payload?.args ?? {}) })
    } catch (error) {
      const code = error instanceof RulesError ? error.code : 'operation-failed'
      send(res, 200, { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } })
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PATH,
        handler: (req, res) => {
          handle(req, res).catch((error) => {
            try {
              send(res, 500, { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } })
            } catch {
              /* the response is already gone */
            }
          })
        },
      }),
    'dsh-rules-manager: /dsh-rules-manager/api route',
  )
}
