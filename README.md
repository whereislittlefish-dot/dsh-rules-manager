# Rules manager

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
- The plugin only accepts the file names in the table above; other paths are
  rejected by the Host.
- Disabling the plugin removes the settings section and its route; the rule
  files themselves are left untouched.

## Install

Install the package directory as a DSH bundle (Plugins → Add plugin, or the
`plugin_manager` install action), then enable `dsh-rules-manager` in the bundle
list and restart the app.
