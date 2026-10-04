# herdr-quick-annotate

Review agent output by voice inside [Herdr](https://github.com/herdrdev/herdr). In copy mode, mark
one passage after another without losing your place. Then paste all of them into the agent's
prompt as labeled quotes and speak your comments.

## Why this plugin exists

First, a shoutout to [plannotator/herdr-annotate](https://github.com/plannotator/herdr-annotate)
by the [Plannotator](https://github.com/backnotprop/plannotator) folks. It is the plugin that
brought annotations to Herdr, and it does a lot more than this one: comments in an editor, an
annotation manager and archive, review of whole Markdown documents and agent replies, Neovim
integration and remote sessions. If you type your comments, use it. This plugin borrows its key
layout and several of its ideas, for example storing context with every snippet, locking the store,
and delivering text via bracketed paste.

My workflow is different. I review long agent replies by voice: read, point at a few passages, and
say what I think about each of them. herdr-annotate got in the way of that in two places:

1. **Every annotation opens a popup editor.** Herdr leaves copy mode whenever a popup opens or
   closes. So after each annotation, the copy-mode cursor, scroll position and selection are gone.
   I was back at the bottom of the pane and had to scroll up again to find the next passage.
2. **Comments go into that popup.** I want to dictate my comments into the agent's prompt, where
   my voice input already works, not type them into a separate window one by one.

So this plugin splits the job differently:

- **Marking is silent.** `prefix+a` adds the selection to a queue and shows a short toast, like
  "Copied to clipboard". It opens no popup and doesn't move focus, so copy mode stays exactly where
  it was and you can select the next passage right away.
- **Inserting puts everything into the prompt.** `prefix+m` pastes all queued passages into the
  focused pane as labeled quotes, without pressing Enter. You then say "A1: … A2: …" and send.

|  | herdr-annotate | herdr-quick-annotate |
|---|---|---|
| Mark a passage | popup editor per annotation | toast; copy mode stays put |
| Where comments go | the popup, one per annotation | the agent's prompt, after inserting |
| Output | Markdown on the clipboard | pasted into the prompt, not submitted |
| Scope | terminal text, documents, agent replies | terminal text, one queue per Herdr tab |

## Requirements

- Herdr 0.9.0 or later
- macOS or Linux
- Node.js 24 or later on the `PATH` the Herdr server starts plugins with

Node runs the TypeScript sources directly, so there is no build step and nothing to install
besides the plugin itself.

## Install

```sh
herdr plugin install koljamaier/herdr-quick-annotate
```

An install stays on the commit it came from. Run the same command again to update.

> **Required.** Bind the keys and turn on Herdr's in-app toasts.

Toasts are the plugin's only feedback, and Herdr turns them off by default. Enabling them also shows
Herdr's own toasts when an agent finishes or needs attention.

```toml
# ~/.config/herdr/config.toml
[ui.toast]
delivery = "herdr"

[[keys.command]]
key = "prefix+a"
type = "plugin_action"
command = "quick-annotate.mark"
description = "mark selection for annotation"

[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "quick-annotate.insert"
description = "insert marked selections into prompt"
```

These are the keys herdr-annotate suggests for `capture` and `manage`. If you keep both plugins,
move or drop those two bindings of herdr-annotate. Its other keys don't conflict.

The keys must start with the prefix. Inside copy mode, Herdr only resolves prefix bindings, and only
these leave copy mode in place.

<details>
<summary><b>Optional:</b> undo and clear</summary>

`prefix+u` and `prefix+shift+u` are free in Herdr's default keymap:

```toml
[[keys.command]]
key = "prefix+u"
type = "plugin_action"
command = "quick-annotate.undo"
description = "remove last marked selection"

[[keys.command]]
key = "prefix+shift+u"
type = "plugin_action"
command = "quick-annotate.clear"
description = "clear marked selections"
```

</details>

Check and reload:

```sh
herdr config check
herdr server reload-config
```

## Use

| Key | Action |
|---|---|
| `Ctrl+B A` | queue the copy-mode selection for this tab · the toast shows the count and a preview · copy mode stays |
| `Ctrl+B M` | paste the tab's queue into the focused pane without Enter, then archive it |
| unbound | `quick-annotate.undo`: drop the last queued selection |
| unbound | `quick-annotate.clear`: drop the whole queue of this tab |

A review round:

1. `Ctrl+B [` enters copy mode. Scroll to the first passage.
2. Select it with `v` and a motion, then press `Ctrl+B A`.
3. `Esc` clears the highlight and keeps copy mode. Move to the next passage and repeat.
4. `q` leaves copy mode. `Ctrl+B M` pastes everything into the prompt.
5. Dictate "A1: … A2: …" and press Enter.

### What gets pasted

```
Anmerkungen zu folgenden Stellen:

[A1]
> first marked passage
> spanning two lines

[A2]
> second marked passage

```

The paste ends with an empty line, so you can start talking right away. Control characters are
stripped, and trailing whitespace is trimmed. The format lives in `src/format.ts`. The header and
the toasts are currently in German.

### Claude Code

Claude Code collapses multi-line pastes into `[Pasted text #N +M lines]`, which would hide the
labels. Pasting the same text again expands it in place. When the agent in the target pane is
Claude Code and the placeholder appears, the plugin does that second paste automatically.

`insert` refuses to paste while the agent is waiting at an approval or question dialog.

### One queue per tab

Each Herdr tab has its own queue. You can mark in any pane of a tab, and `insert` pastes that tab's
queue into the focused pane. Queues are files, so they survive a Herdr restart:

- `~/.local/state/herdr/plugins/quick-annotate/queues/<tab-id>.jsonl`: the pending snippets, with
  the pane, working directory, workspace and tab they came from
- `~/.local/state/herdr/plugins/quick-annotate/history.jsonl`: every inserted batch

## Limitations

- **Marks during streaming can be dropped.** If the pane content changes between the last frame
  and the keypress, for example while the agent is still streaming, Herdr skips the action
  without notice (`stale_content`). If no toast appears, nothing was queued.
- **The selection stays highlighted after marking.** Plugins can't clear it. `Esc` does, and keeps
  copy mode.
- **Only Herdr's own selection is read.** The plugin uses Herdr's current selection and never falls
  back to the clipboard, so stale clipboard content can't end up in the queue. A Visual-mode
  selection inside Neovim or another terminal app isn't Herdr's selection, so the plugin can't see
  it. Select with Herdr's copy mode instead.
- **Toast limits.** Herdr shows each toast for 5 seconds, at most one per second. A mark is still
  queued when its toast is rate-limited.
- **Untested setups.** Remote sessions (SSH, `herdr --remote`) haven't been tested.

## Development

```sh
npm install          # TypeScript and @types/node, for type checking only
npm test             # node --test
npm run typecheck
herdr plugin link "$PWD"
```

`herdr plugin install` refuses to overwrite a linked plugin. Run `herdr plugin unlink quick-annotate`
before switching to the GitHub install. Action runs, including stderr, show up in
`herdr plugin log list`.
