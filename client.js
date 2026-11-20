/**
 * `dsh-rules-manager` — browser half.
 *
 * One settings section in the DSH settings panel: it lists the user-global
 * rule files and every project's rule files, and opens any of them in a
 * Markdown editor. Nothing here reads or writes the filesystem: every
 * operation goes through the Host half's fenced RPC route.
 */

window.__ModuleLoader__.load({
  id: 'dsh-rules-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Client locale namespace. */
    const NS = 'rules-manager'
    /** Settings section id; the icon registration reuses it. */
    const SECTION_ID = 'rules'
    /** Navigation position inside the settings rail. */
    const SECTION_ORDER = 25
    /** Host RPC endpoint registered by index.js. */
    const RPC_URL = '/dsh-rules-manager/api/rpc'
    /** How long a success notice stays on screen. */
    const NOTICE_MS = 3200

    const DICT_ZH = {
      'nav': '规则',
      'title': '规则管理',
      'intro': '管理 DSH 的全局规则与各项目规则。这些 AGENTS.md 文件会在会话开始时作为工作区指令交给模型；更具体的文件优先于更宽泛的文件。',
      'group.global': '全局规则',
      'group.projects': '项目规则',
      'global.dsh': '用户全局规则',
      'global.agents': '共享 Agents 规则',
      'global.dsh.hint': '对所有项目生效，路径为 $DSH_HOME/AGENTS.md。',
      'global.agents.hint': '所有使用者共享的规则，路径为 $DSH_AGENTS_HOME/AGENTS.md。',
      'state.missing': '未创建',
      'state.exists': '{size} · 更新于 {time}',
      'state.empty': '空文件',
      'state.dirMissing': '目录不存在',
      'file.missing': '未创建',
      'action.refresh': '刷新',
      'action.addProject': '添加项目',
      'action.save': '保存',
      'action.saving': '保存中…',
      'action.delete': '删除',
      'action.back': '返回',
      'action.reload': '重新加载',
      'action.cancel': '取消',
      'action.confirm': '确定',
      'action.remove': '移出列表',
      'action.open': '编辑',
      'action.refreshing': '刷新中…',
      'editor.exists': '文件已存在',
      'editor.new': '文件尚未创建，保存后生成',
      'editor.dirty': '有未保存的修改',
      'editor.meta': '{chars} 字符 · {size}',
      'editor.placeholder': '写下这个规则文件的内容…',
      'addProject.title': '添加项目目录',
      'addProject.hint': '输入一个已存在的目录，它的规则文件会出现在项目列表里。',
      'addProject.placeholder': '例如 D:\\work\\my-project',
      'empty.projects': '还没有项目。DSH 的项目会自动出现在这里，也可以用「添加项目」手动指定目录。',
      'empty.files': '还没有规则文件',
      'source.custom': '手动添加',
      'notice.saved': '已保存',
      'notice.deleted': '已删除',
      'notice.added': '已添加项目',
      'notice.removed': '已从列表移除',
      'confirm.delete.title': '删除规则文件？',
      'confirm.delete.body': '将从磁盘删除 {path}，此操作不可撤销。',
      'confirm.leave.title': '放弃未保存的修改？',
      'confirm.leave.body': '当前编辑的内容还没有保存。',
      'confirm.removeProject.title': '从列表中移除项目？',
      'confirm.removeProject.body': '只会移除列表条目，磁盘上的文件和规则内容不会被删除。',
      'error.generic': '操作失败。',
      'error.invalid-target': '要操作的规则文件无效。',
      'error.invalid-path': '项目目录无效，请填写绝对路径。',
      'error.not-a-directory': '该目录不存在或不是文件夹。',
      'error.invalid-content': '缺少要保存的内容。',
      'error.too-large': '文件过大，不能在面板内编辑。',
      'error.body-too-large': '请求内容过大。',
      'error.unknown-method': '未知操作。',
      'error.operation-failed': '操作失败。',
      'error.bridge': '连接 Host 失败：{message}',
    }

    const DICT_EN = {
      'nav': 'Rules',
      'title': 'Rule files',
      'intro': 'Manage DSH global and per-project rule files. These AGENTS.md files reach the model as workspace instructions when a session starts; more specific files take precedence over broader ones.',
      'group.global': 'Global rules',
      'group.projects': 'Project rules',
      'global.dsh': 'User-global rules',
      'global.agents': 'Shared agents rules',
      'global.dsh.hint': 'Applies to every project, at $DSH_HOME/AGENTS.md.',
      'global.agents.hint': 'Shared across consumers, at $DSH_AGENTS_HOME/AGENTS.md.',
      'state.missing': 'Not created',
      'state.exists': '{size} · updated {time}',
      'state.empty': 'Empty file',
      'state.dirMissing': 'Directory missing',
      'file.missing': 'Not created',
      'action.refresh': 'Refresh',
      'action.addProject': 'Add project',
      'action.save': 'Save',
      'action.saving': 'Saving…',
      'action.delete': 'Delete',
      'action.back': 'Back',
      'action.reload': 'Reload',
      'action.cancel': 'Cancel',
      'action.confirm': 'Confirm',
      'action.remove': 'Remove',
      'action.open': 'Edit',
      'action.refreshing': 'Refreshing…',
      'editor.exists': 'File exists',
      'editor.new': 'Not created yet; saving creates it',
      'editor.dirty': 'Unsaved changes',
      'editor.meta': '{chars} characters · {size}',
      'editor.placeholder': 'Write this rule file…',
      'addProject.title': 'Add a project directory',
      'addProject.hint': 'Enter an existing directory; its rule files appear in the project list.',
      'addProject.placeholder': 'For example D:\\work\\my-project',
      'empty.projects': 'No projects yet. DSH projects appear here automatically; use "Add project" to name a directory by hand.',
      'empty.files': 'No rule files yet',
      'source.custom': 'Added by hand',
      'notice.saved': 'Saved',
      'notice.deleted': 'Deleted',
      'notice.added': 'Project added',
      'notice.removed': 'Removed from the list',
      'confirm.delete.title': 'Delete this rule file?',
      'confirm.delete.body': 'This removes {path} from disk and cannot be undone.',
      'confirm.leave.title': 'Discard unsaved changes?',
      'confirm.leave.body': 'The current draft has not been saved.',
      'confirm.removeProject.title': 'Remove this project from the list?',
      'confirm.removeProject.body': 'Only the list entry is removed; files and rules on disk stay untouched.',
      'error.generic': 'The operation failed.',
      'error.invalid-target': 'That rule file target is not valid.',
      'error.invalid-path': 'Enter an absolute project directory.',
      'error.not-a-directory': 'That directory does not exist or is not a folder.',
      'error.invalid-content': 'Nothing to save.',
      'error.too-large': 'The file is too large to edit in this panel.',
      'error.body-too-large': 'The request body is too large.',
      'error.unknown-method': 'Unknown operation.',
      'error.operation-failed': 'The operation failed.',
      'error.bridge': 'Could not reach the Host: {message}',
    }

    const CSS = `
.rules-root{position:relative;display:flex;flex-direction:column;gap:14px;max-width:760px;color:var(--dsw-alias-label-primary)}
.rules-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.rules-title{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.rules-intro{margin:6px 0 0;max-width:560px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.rules-group{display:flex;flex-direction:column;gap:8px}
.rules-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:26px}
.rules-group-title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.rules-count{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.rules-cards{display:flex;flex-direction:column;gap:8px}
.rules-card{display:flex;flex-direction:column;gap:9px;padding:12px 14px;border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));border-radius:12px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2))}
.rules-card[data-clickable="true"]{cursor:pointer}
.rules-card[data-clickable="true"]:hover{border-color:var(--dsw-alias-border-l3)}
.rules-card-head{display:flex;align-items:center;gap:8px;min-width:0}
.rules-card-title{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rules-badge{flex:none;padding:1px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.rules-grow{flex:1 1 auto;min-width:0}
.rules-card-path{font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rules-card-state{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.rules-card-state[data-warn="true"]{color:var(--dsw-alias-state-warn-primary)}
.rules-files{display:flex;flex-wrap:wrap;gap:6px}
.rules-file{appearance:none;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.rules-file[data-state="on"]{border-style:solid;border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.rules-file:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.rules-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.rules-dot{width:6px;height:6px;flex:none;border-radius:999px;background:var(--dsw-alias-border-l3)}
.rules-file[data-state="on"] .rules-dot{background:var(--dsw-alias-state-success-primary)}
.rules-file-meta{color:var(--dsw-alias-label-tertiary);font-size:11px}
.rules-empty{padding:16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-tertiary)}
.rules-add{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.rules-add-title{margin:0;font-size:12.5px;font-weight:600}
.rules-add-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.rules-add-row{display:flex;gap:8px;align-items:center}
.rules-input{flex:1 1 auto;min-width:0;height:32px;box-sizing:border-box;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
.rules-input:focus{border-color:var(--dsw-alias-brand-primary)}
.rules-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.rules-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;white-space:nowrap;cursor:pointer;transition:background .12s ease,color .12s ease}
.rules-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.rules-btn:disabled{opacity:.45;cursor:default}
.rules-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.rules-btn[data-variant="primary"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground,#fff)}
.rules-btn[data-variant="primary"]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.rules-btn[data-variant="ghost"]{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.rules-btn[data-variant="ghost"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.rules-btn[data-variant="danger"]{border-color:var(--dsw-alias-state-error-primary);background:transparent;color:var(--dsw-alias-state-error-primary)}
.rules-btn[data-variant="danger"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.rules-btn[data-size="sm"]{height:26px;padding:0 9px;font-size:12px}
.rules-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.rules-alert{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);font-size:12.5px;line-height:18px;word-break:break-word}
.rules-toast{padding:7px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.rules-loading{padding:32px 0;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-tertiary)}
.rules-editor{display:flex;flex-direction:column;gap:10px}
.rules-editor-head{display:flex;align-items:center;gap:10px;min-width:0}
.rules-editor-title{display:flex;align-items:baseline;gap:8px;min-width:0}
.rules-editor-file{font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:15px;font-weight:600}
.rules-editor-state{font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.rules-editor-path{font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rules-textarea{width:100%;box-sizing:border-box;height:min(46vh,380px);min-height:220px;resize:vertical;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12.5px;line-height:20px;outline:none;tab-size:2}
.rules-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.rules-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.rules-editor-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.rules-editor-meta{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.rules-editor-meta[data-dirty="true"]{color:var(--dsw-alias-state-warn-primary)}
.rules-modal{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32))}
.rules-modal-card{display:flex;flex-direction:column;gap:10px;width:min(420px,100%);padding:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.28)}
.rules-modal-title{margin:0;font-size:14px;font-weight:600}
.rules-modal-body{margin:0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);word-break:break-word}
.rules-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
`

    /**
     * Call one Host operation.
     * @param method - operation name.
     * @param args - operation payload.
     * @returns the operation value; throws an Error carrying `code`.
     */
    async function rpc(method, args) {
      let response
      try {
        response = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, args: args ?? {} }),
        })
      } catch (error) {
        const failure = new Error(error instanceof Error ? error.message : String(error))
        failure.code = 'bridge'
        throw failure
      }
      const text = await response.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        const failure = new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`)
        failure.code = 'bridge'
        throw failure
      }
      if (!response.ok || body?.ok === false) {
        const failure = new Error(body?.error?.message ?? `HTTP ${response.status}`)
        failure.code = body?.error?.code ?? 'operation-failed'
        throw failure
      }
      return body.value
    }

    /**
     * Interpolate `{name}` placeholders.
     * @param text - template.
     * @param vars - values.
     * @returns the filled text.
     */
    function fill(text, vars) {
      return String(text).replace(/\{(\w+)\}/g, (match, key) => (vars !== undefined && Object.hasOwn(vars, key) ? String(vars[key]) : match))
    }

    /**
     * Format a byte count for a compact row.
     * @param bytes - byte size.
     * @returns the display text.
     */
    function formatSize(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`
      return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
    }

    /**
     * Format one modification instant in the user's locale.
     * @param mtime - ISO instant, or null.
     * @returns the display text, or an empty string.
     */
    function formatTime(mtime) {
      if (typeof mtime !== 'string' || mtime === '') return ''
      const date = new Date(mtime)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    /**
     * Bind one namespace and re-render on locale changes.
     * @param ctx - client context.
     * @returns the translate function.
     */
    function useT(ctx) {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const unsubscribe = ctx.locale.subscribe(() => setTick((value) => value + 1))
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [ctx])
      return ctx.locale.bind(NS)
    }

    /**
     * Present a failure with its localized code.
     * @param t - translate function.
     * @param failure - thrown value.
     * @returns display text.
     */
    function errorText(t, failure) {
      const code = failure !== null && typeof failure === 'object' ? failure.code : undefined
      const message = failure instanceof Error ? failure.message : String(failure ?? '')
      if (typeof code === 'string') {
        const translated = t(`error.${code}`)
        if (translated !== `error.${code}`) return fill(translated, { message })
      }
      return message === '' ? t('error.generic') : message
    }

    /**
     * One file row inside a card.
     * @param props - file row props.
     * @returns the button element.
     */
    function FileButton(props) {
      const { t, file, enabled, onOpen } = props
      const state = file.exists ? 'on' : 'off'
      return h('button', {
        type: 'button',
        className: 'rules-file',
        'data-state': state,
        title: file.path,
        disabled: !enabled,
        onClick: () => onOpen(file),
      },
        h('span', { className: 'rules-dot', 'aria-hidden': 'true' }),
        h('span', null, file.name),
        h('span', { className: 'rules-file-meta' }, file.exists ? formatSize(file.size) : t('file.missing')),
      )
    }

    /**
     * The list view: global files, then every project.
     * @param props - list props.
     * @returns the list element tree.
     */
    function ListView(props) {
      const {
        t, snapshot, loading, busy, adding, addPath, onAddPath, onStartAdd, onCancelAdd,
        onSubmitAdd, onRefresh, onOpen, onRemoveProject,
      } = props

      const projects = snapshot === null ? [] : snapshot.projects
      const globals = snapshot === null ? [] : snapshot.global

      const addForm = adding
        ? h('div', { className: 'rules-add' },
          h('p', { className: 'rules-add-title' }, t('addProject.title')),
          h('p', { className: 'rules-add-hint' }, t('addProject.hint')),
          h('div', { className: 'rules-add-row' },
            h('input', {
              className: 'rules-input',
              value: addPath,
              placeholder: t('addProject.placeholder'),
              spellCheck: false,
              autoFocus: true,
              onChange: (event) => onAddPath(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') onSubmitAdd()
                if (event.key === 'Escape') onCancelAdd()
              },
            }),
            h('button', {
              type: 'button',
              className: 'rules-btn',
              'data-variant': 'primary',
              disabled: busy === 'project' || addPath.trim() === '',
              onClick: onSubmitAdd,
            }, busy === 'project' ? t('action.saving') : t('action.confirm')),
            h('button', { type: 'button', className: 'rules-btn', 'data-variant': 'ghost', onClick: onCancelAdd }, t('action.cancel')),
          ),
        )
        : null

      return h(React.Fragment, null,
        h('div', { className: 'rules-head' },
          h('div', null,
            h('h2', { className: 'rules-title' }, t('title')),
            h('p', { className: 'rules-intro' }, t('intro')),
          ),
          h('button', {
            type: 'button',
            className: 'rules-btn',
            'data-variant': 'ghost',
            disabled: loading,
            onClick: onRefresh,
          }, loading ? t('action.refreshing') : t('action.refresh')),
        ),
        snapshot === null
          ? h('div', { className: 'rules-loading' }, loading ? '…' : '')
          : h(React.Fragment, null,
            h('section', { className: 'rules-group' },
              h('div', { className: 'rules-group-head' },
                h('h3', { className: 'rules-group-title' }, t('group.global')),
                h('span', { className: 'rules-count' }, `${globals.length}`),
              ),
              h('div', { className: 'rules-cards' }, globals.map((item) => h('div', {
                key: item.key,
                className: 'rules-card',
                'data-clickable': 'true',
                role: 'button',
                tabIndex: 0,
                onClick: () => onOpen({ scope: 'global', key: item.key, name: 'AGENTS.md' }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen({ scope: 'global', key: item.key, name: 'AGENTS.md' })
                  }
                },
              },
                h('div', { className: 'rules-card-head' },
                  h('span', { className: 'rules-card-title' }, t(`global.${item.key}`)),
                  h('span', { className: 'rules-grow' }),
                  h('span', { className: 'rules-card-state', title: item.path }, item.exists ? fill(t('state.exists'), { size: formatSize(item.size), time: formatTime(item.mtime) }) : t('state.missing')),
                ),
                h('div', { className: 'rules-card-path', title: item.path }, item.path),
                h('div', { className: 'rules-card-state' }, t(`global.${item.key}.hint`)),
              ))),
            ),
            h('section', { className: 'rules-group' },
              h('div', { className: 'rules-group-head' },
                h('h3', { className: 'rules-group-title' }, t('group.projects')),
                h('div', { className: 'rules-actions' },
                  h('span', { className: 'rules-count' }, `${projects.length}`),
                  h('button', {
                    type: 'button',
                    className: 'rules-btn',
                    'data-size': 'sm',
                    'data-variant': adding ? 'ghost' : 'primary',
                    onClick: adding ? onCancelAdd : onStartAdd,
                  }, adding ? t('action.cancel') : t('action.addProject')),
                ),
              ),
              addForm,
              projects.length === 0
                ? h('div', { className: 'rules-empty' }, t('empty.projects'))
                : h('div', { className: 'rules-cards' }, projects.map((project) => h('div', { key: project.id, className: 'rules-card' },
                  h('div', { className: 'rules-card-head' },
                    h('span', { className: 'rules-card-title', title: project.title }, project.title),
                    project.source === 'custom' ? h('span', { className: 'rules-badge' }, t('source.custom')) : null,
                    project.exists ? null : h('span', { className: 'rules-badge' }, t('state.dirMissing')),
                    h('span', { className: 'rules-grow' }),
                    project.source === 'custom'
                      ? h('button', {
                        type: 'button',
                        className: 'rules-btn',
                        'data-size': 'sm',
                        'data-variant': 'ghost',
                        onClick: () => onRemoveProject(project),
                      }, t('action.remove'))
                      : null,
                  ),
                  h('div', { className: 'rules-card-path', title: project.path }, project.path),
                  h('div', { className: 'rules-files' }, project.files.map((file) => h(FileButton, {
                    key: file.name,
                    t,
                    file,
                    enabled: project.exists,
                    onOpen: (target) => onOpen({ scope: 'project', path: project.path, name: target.name }),
                  }))),
                ))),
            ),
          ),
      )
    }

    /**
     * The editor view for one file.
     * @param props - editor props.
     * @returns the editor element tree.
     */
    function EditorView(props) {
      const { t, editor, dirty, busy, onBack, onChange, onSave, onDelete, onReload } = props
      const characters = editor.content.length
      return h('div', { className: 'rules-editor' },
        h('div', { className: 'rules-editor-head' },
          h('button', { type: 'button', className: 'rules-btn', 'data-variant': 'ghost', onClick: onBack }, `← ${t('action.back')}`),
          h('div', { className: 'rules-editor-title' },
            h('span', { className: 'rules-editor-file' }, editor.name),
            h('span', { className: 'rules-editor-state' }, editor.exists ? t('editor.exists') : t('editor.new')),
          ),
          h('span', { className: 'rules-grow' }),
          h('button', {
            type: 'button',
            className: 'rules-btn',
            'data-size': 'sm',
            'data-variant': 'ghost',
            disabled: busy !== null,
            onClick: onReload,
          }, t('action.reload')),
        ),
        h('div', { className: 'rules-editor-path', title: editor.path }, editor.path),
        h('textarea', {
          className: 'rules-textarea',
          value: editor.content,
          spellCheck: false,
          placeholder: t('editor.placeholder'),
          onChange: (event) => onChange(event.target.value),
        }),
        h('div', { className: 'rules-editor-foot' },
          h('span', { className: 'rules-editor-meta', 'data-dirty': dirty ? 'true' : 'false' },
            dirty
              ? t('editor.dirty')
              : fill(t('editor.meta'), { chars: characters, size: formatSize(editor.exists ? new Blob([editor.content]).size : 0) }),
          ),
          h('div', { className: 'rules-actions' },
            h('button', {
              type: 'button',
              className: 'rules-btn',
              'data-variant': 'danger',
              disabled: !editor.exists || busy !== null,
              onClick: onDelete,
            }, t('action.delete')),
            h('button', {
              type: 'button',
              className: 'rules-btn',
              'data-variant': 'primary',
              disabled: busy !== null || (editor.exists && !dirty),
              onClick: onSave,
            }, busy === 'save' ? t('action.saving') : t('action.save')),
          ),
        ),
      )
    }

    /**
     * The settings section body.
     * @param props - slot props, including the injected client context.
     * @returns the section element tree.
     */
    function RulesSection(props) {
      const ctx = props.ctx
      const t = useT(ctx)
      const [snapshot, setSnapshot] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [editor, setEditor] = React.useState(null)
      const [adding, setAdding] = React.useState(false)
      const [addPath, setAddPath] = React.useState('')
      const [confirm, setConfirm] = React.useState(null)
      const ticket = React.useRef(0)

      const refresh = React.useCallback(async () => {
        const current = ticket.current + 1
        ticket.current = current
        setLoading(true)
        setError(null)
        try {
          const value = await rpc('snapshot')
          if (ticket.current === current) setSnapshot(value)
        } catch (failure) {
          if (ticket.current === current) setError(failure)
        } finally {
          if (ticket.current === current) setLoading(false)
        }
      }, [])

      React.useEffect(() => { void refresh() }, [refresh])

      React.useEffect(() => {
        if (notice === null) return undefined
        const timer = setTimeout(() => setNotice(null), NOTICE_MS)
        return () => clearTimeout(timer)
      }, [notice])

      React.useEffect(() => {
        if (confirm === null) return undefined
        const onKeyDown = (event) => { if (event.key === 'Escape') setConfirm(null) }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [confirm])

      const openFile = React.useCallback(async (target) => {
        setBusy('open')
        setError(null)
        setConfirm(null)
        try {
          const file = await rpc('read', { target })
          setEditor({
            target,
            name: target.name,
            path: file.path,
            exists: file.exists,
            content: file.content,
            original: file.content,
            size: file.size,
            mtime: file.mtime,
          })
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(null)
        }
      }, [])

      const saveFile = React.useCallback(async () => {
        if (editor === null) return
        const draft = editor.content
        setBusy('save')
        setError(null)
        try {
          const saved = await rpc('write', { target: editor.target, content: draft })
          setEditor((current) => current === null ? null : { ...current, exists: true, original: draft, size: saved.size, mtime: saved.mtime })
          setNotice(t('notice.saved'))
          void refresh()
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(null)
        }
      }, [editor, refresh, t])

      const deleteFile = React.useCallback(async () => {
        if (editor === null) return
        setBusy('delete')
        setError(null)
        setConfirm(null)
        try {
          await rpc('remove', { target: editor.target })
          setEditor(null)
          setNotice(t('notice.deleted'))
          await refresh()
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(null)
        }
      }, [editor, refresh, t])

      const submitProject = React.useCallback(async () => {
        setBusy('project')
        setError(null)
        try {
          await rpc('addProject', { path: addPath })
          setAdding(false)
          setAddPath('')
          setNotice(t('notice.added'))
          await refresh()
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(null)
        }
      }, [addPath, refresh, t])

      const removeProject = React.useCallback(async (project) => {
        setBusy('remove-project')
        setError(null)
        setConfirm(null)
        try {
          await rpc('removeProject', { path: project.path })
          setNotice(t('notice.removed'))
          await refresh()
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(null)
        }
      }, [refresh, t])

      const dirty = editor !== null && editor.content !== editor.original

      const requestBack = React.useCallback(() => {
        if (dirty) {
          setConfirm({ kind: 'leave' })
          return
        }
        setEditor(null)
        setError(null)
      }, [dirty])

      const confirmView = (() => {
        if (confirm === null) return null
        let title = ''
        let body = ''
        let action = () => {}
        if (confirm.kind === 'leave') {
          title = t('confirm.leave.title')
          body = t('confirm.leave.body')
          action = () => { setConfirm(null); setEditor(null); setError(null) }
        } else if (confirm.kind === 'delete') {
          title = t('confirm.delete.title')
          body = fill(t('confirm.delete.body'), { path: editor === null ? '' : editor.path })
          action = () => { void deleteFile() }
        } else if (confirm.kind === 'removeProject') {
          title = t('confirm.removeProject.title')
          body = t('confirm.removeProject.body')
          action = () => { void removeProject(confirm.project) }
        }
        return h('div', { className: 'rules-modal' },
          h('div', { className: 'rules-modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('p', { className: 'rules-modal-title' }, title),
            h('p', { className: 'rules-modal-body' }, body),
            h('div', { className: 'rules-modal-actions' },
              h('button', { type: 'button', className: 'rules-btn', 'data-variant': 'ghost', onClick: () => setConfirm(null) }, t('action.cancel')),
              h('button', { type: 'button', className: 'rules-btn', 'data-variant': 'danger', disabled: busy !== null, onClick: action }, t('action.confirm')),
            ),
          ),
        )
      })()

      return h('div', { className: 'rules-root' },
        editor === null
          ? h(ListView, {
            t,
            snapshot,
            loading,
            busy,
            adding,
            addPath,
            onAddPath: setAddPath,
            onStartAdd: () => { setAdding(true); setError(null) },
            onCancelAdd: () => { setAdding(false); setAddPath('') },
            onSubmitAdd: () => { void submitProject() },
            onRefresh: () => { void refresh() },
            onOpen: (target) => { void openFile(target) },
            onRemoveProject: (project) => setConfirm({ kind: 'removeProject', project }),
          })
          : h(EditorView, {
            t,
            editor,
            dirty,
            busy,
            onBack: requestBack,
            onChange: (value) => setEditor((current) => current === null ? null : { ...current, content: value }),
            onSave: () => { void saveFile() },
            onDelete: () => setConfirm({ kind: 'delete' }),
            onReload: () => { void openFile(editor.target) },
          }),
        error !== null ? h('div', { className: 'rules-alert', role: 'alert' }, errorText(t, error)) : null,
        notice !== null ? h('div', { className: 'rules-toast', role: 'status' }, notice) : null,
        confirmView,
      )
    }

    /**
     * The navigation icon for this settings section.
     * @param props - `{ size }`.
     * @returns the icon element.
     */
    function SectionIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M4.25 2.5h5L12.5 5.75V13.5h-8.25z', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round' }),
        h('path', { d: 'M9.25 2.5v3.25h3.25', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.1 8.2h4.3M6.1 10.7h4.3', stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round' }),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const element = document.createElement('style')
          element.id = 'dsh-rules-manager-styles'
          element.textContent = CSS
          document.head.appendChild(element)
          return () => element.remove()
        }, 'dsh-rules-manager: styles')
        ctx.effect(() => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), 'dsh-rules-manager: locale')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: SECTION_ID,
              order: SECTION_ORDER,
              label: () => t('nav'),
              locale: NS,
              inject: () => ({ ctx }),
            },
            RulesSection,
          ),
        )
        ctx.slots.inject('settings.section.icon', () =>
          ctx.slots.register(
            {
              name: 'settings.section.icon',
              id: SECTION_ID,
            },
            SectionIcon,
          ),
        )
      },
    }
  },
})
