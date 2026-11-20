/**
 * Browser-half regression test: loads the client bundle with a mock module
 * loader, a hook-less React stand-in, and a mocked fetch, then walks the
 * rendered element tree for the list and editor views.
 *
 * Run with `node test/render.test.mjs`.
 */
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

let captured
globalThis.window = { __ModuleLoader__: { load(config) { captured = config } } }
globalThis.document = {
  createElement: () => ({ id: '', textContent: '', remove() {} }),
  head: { appendChild() {} },
}

const snapshotValue = {
  home: 'C:\\Users\\demo\\.dsh',
  agentsHome: 'C:\\Users\\demo\\.agents',
  global: [
    { key: 'dsh', name: 'AGENTS.md', path: 'C:\\Users\\demo\\.dsh\\AGENTS.md', scope: 'global', exists: true, size: 2531, mtime: '2026-10-10T03:37:41.398Z' },
    { key: 'agents', name: 'AGENTS.md', path: 'C:\\Users\\demo\\.agents\\AGENTS.md', scope: 'global', exists: false, size: 0, mtime: null },
  ],
  projects: [
    {
      id: 'workspace:1', title: 'DSH', path: 'D:\\DSH', source: 'workspace', exists: true,
      files: [
        { name: 'AGENTS.md', path: 'D:\\DSH\\AGENTS.md', scope: 'project', exists: true, size: 2531, mtime: '2026-10-10T03:37:49.607Z' },
        { name: 'CLAUDE.md', path: 'D:\\DSH\\CLAUDE.md', scope: 'project', exists: false, size: 0, mtime: null },
        { name: 'AGENTS.local.md', path: 'D:\\DSH\\AGENTS.local.md', scope: 'project', exists: false, size: 0, mtime: null },
        { name: 'CLAUDE.local.md', path: 'D:\\DSH\\CLAUDE.local.md', scope: 'project', exists: false, size: 0, mtime: null },
      ],
    },
    {
      id: 'custom:2', title: 'demo', path: 'D:\\work\\demo', source: 'custom', exists: false,
      files: [
        { name: 'AGENTS.md', path: 'D:\\work\\demo\\AGENTS.md', scope: 'project', exists: false, size: 0, mtime: null },
      ],
    },
  ],
}

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ ok: true, value: snapshotValue }),
})

const React = {
  createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (fn) => { fn() },
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  Fragment: 'Fragment',
}

// eslint-disable-next-line no-eval
eval(source)

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

const registrations = []
const localeRegistrations = []
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  locale: {
    register(namespace, dictionaries) { localeRegistrations.push({ namespace, dictionaries }) },
    bind() { return (key) => key },
    subscribe() { return () => {} },
  },
  slots: {
    inject(name, callback) { return callback() },
    register(options, component) { registrations.push({ options, component }) },
  },
}

plugin.apply(ctx)

const dictionaries = localeRegistrations[0].dictionaries
const zhKeys = Object.keys(dictionaries.zh)
const enKeys = Object.keys(dictionaries.en)
if (zhKeys.length !== enKeys.length) throw new Error('locale dictionaries differ in size')
if (dictionaries.zh.nav !== '规则管理') throw new Error(`settings nav label is ${dictionaries.zh.nav}`)
console.log('locale keys:', zhKeys.length, 'nav:', dictionaries.zh.nav)

const section = registrations.find((entry) => entry.options.name === 'settings.section')
if (section === undefined) throw new Error('settings.section was not registered')
if (section.options.id !== 'rules') throw new Error('settings.section id changed')
console.log('registered:', registrations.map((entry) => `${entry.options.name}:${entry.options.id}`).join(', '))

const sectionTree = section.component({ ctx, close: () => {} })
await new Promise((resolve) => setTimeout(resolve, 10))

/**
 * Find the first element created from a named component.
 * @param tree - element tree.
 * @param name - component function name.
 * @returns the matching element, or undefined.
 */
function findByComponent(tree, name) {
  if (tree === null || typeof tree !== 'object') return undefined
  if (typeof tree.tag === 'function' && tree.tag.name === name) return tree
  for (const child of tree.children ?? []) {
    const found = findByComponent(child, name)
    if (found !== undefined) return found
  }
  return undefined
}

const listElement = findByComponent(sectionTree, 'ListView')
if (listElement === undefined) throw new Error('ListView was not rendered')

const listTree = listElement.tag({ ...listElement.props, snapshot: snapshotValue, loading: false })
const buttons = []
const texts = []
function walk(tree) {
  if (tree === null || tree === undefined) return
  if (Array.isArray(tree)) { for (const item of tree) walk(item); return }
  if (typeof tree === 'string') { texts.push(tree); return }
  if (typeof tree !== 'object') return
  if (typeof tree.tag === 'function' && tree.tag.name === 'FileRow') {
    walk(tree.tag(tree.props))
    return
  }
  if (tree.tag === 'button') buttons.push(tree)
  for (const child of tree.children ?? []) walk(child)
}
walk(listTree)

const editButtons = buttons.filter((button) => String(button.props.className).includes('rules-btn')
  && (button.children ?? []).includes('action.edit'))
const fileRows = texts.filter((text) => text === 'AGENTS.md' || text === 'CLAUDE.md' || text === 'AGENTS.local.md' || text === 'CLAUDE.local.md')
console.log('edit buttons:', editButtons.length, 'file name cells:', fileRows.length)
if (editButtons.length !== 7) throw new Error(`expected 7 edit buttons (2 global + 5 project files), got ${editButtons.length}`)
if (!texts.includes('DSH')) throw new Error('project title missing from the list')

const editorState = {
  target: { scope: 'project', path: 'D:\\DSH', name: 'AGENTS.md' },
  name: 'AGENTS.md',
  path: 'D:\\DSH\\AGENTS.md',
  exists: true,
  content: '# DSH\n\n规则内容',
  original: '# DSH\n\n规则内容',
  size: 20,
  mtime: '2026-10-10T03:37:49.607Z',
}
let stateCount = 0
React.useState = (initial) => {
  stateCount += 1
  if (stateCount === 7) return [editorState, () => {}]
  return [typeof initial === 'function' ? initial() : initial, () => {}]
}
const editorTree = section.component({ ctx, close: () => {} })
const editorNode = findByComponent(editorTree, 'EditorView')
if (editorNode === undefined) throw new Error('EditorView did not render from editor state')
const renderedEditor = editorNode.tag(editorNode.props)
const editorTexts = []
function collect(tree) {
  if (tree === null || tree === undefined) return
  if (Array.isArray(tree)) { for (const item of tree) collect(item); return }
  if (typeof tree === 'string') { editorTexts.push(tree); return }
  if (typeof tree !== 'object') return
  for (const child of tree.children ?? []) collect(child)
}
collect(renderedEditor)
console.log('editor texts:', editorTexts.join(' | '))
if (!editorTexts.includes('AGENTS.md')) throw new Error('editor file name missing')
if (!editorTexts.includes('action.save')) throw new Error('editor save action missing')

console.log('RENDER_OK')
