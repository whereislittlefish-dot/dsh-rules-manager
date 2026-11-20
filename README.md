# Rules manager

English | [中文](README.zh.md)

`dsh-rules-manager` adds a **Rule manager** section to the DSH settings panel: it lists
the rule files DSH loads as workspace instructions and lets you view, create,
edit, and delete them without leaving the app.

## What it manages

| Scope | Files |
|---|---|
| User-global | `$DSH_HOME/AGENTS.md` (default `~/.dsh/AGENTS.md`) |
| Shared agents | `$DSH_AGENTS_HOME/AGENTS.md` (default `~/.agents/AGENTS.md`) |
| Project | `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.md`, `CLAUDE.local.md` in each project directory |

Projects come from the DSH workspace registry. The **Add project** control adds
any existing absolute directory to the list; removing it only drops the list
entry and never touches files on disk.

## Backups

Every save, delete, and restore copies the current file into
`$DSH_HOME/rule-backups/` before touching it. Each rule file gets its own
folder named after the rule and its owner (`global-dsh`, `global-agents`, or
`project-<name>-<hash>`), and every backup carries the local timestamp plus the
original file name, for example
`20261120-171758-123__AGENTS.md.bak`. A `.json` sidecar next to it records the
target path, label, creation time, and reason (`save`, `delete`, `restore`).

In the editor, **Backups** lists the backups of the current file and
**Restore** replaces it with the chosen one. The current content is backed up
before a restore, so a restore can itself be undone. The newest 50 backups per
file are kept; older ones are pruned.

## Using it

1. Open **Settings** in the sidebar, then choose **Rule manager**.
2. Press **Edit** on a global card, or on one file row inside a project card.
3. Edit in the text area and press **Save**. Saving a missing file creates it
   (and its directory when needed); **Delete** removes it from disk.
4. Restart or start a new session for DSH to load the changed instructions.

## Behavior and limits

- Files are read and written by the Host half of the plugin through one fenced
  route, `/dsh-rules-manager/api/rpc`. The browser never receives a filesystem
  handle.
- Rule files larger than 1 MiB are listed but cannot be opened in the editor.
- A failed backup does not block the write; the panel reports it as a warning.
  Files over 4 MiB are written without a backup.
- The plugin only accepts the file names in the table above; other paths are
  rejected by the Host.
- Disabling the plugin removes the settings section and its route; the rule
  files themselves are left untouched.

## Install

Install the package directory as a DSH bundle (Plugins → Add plugin, or the
`plugin_manager` install action), then enable `dsh-rules-manager` in the bundle
list and restart the app.
