# Changelog

## 0.1.36 — 2026-09-07

- Windsurf (Devin) and Cursor: a submit-time popup left unanswered until the hold expires
  now closes on Linux and macOS too (it could previously stay open and keep the local
  store busy), and the strengthened prompt it offered is discarded — it no longer
  reappears on your next, unrelated prompt.
- A popup is no longer opened when too little of the hold is left to act on it (under
  30 seconds after preparation): the prompt is released unchanged instead.
- The prompt is released unchanged, with no popup, when the extension is not ready to
  deliver a selection (consent declined, or the extension not running in this editor) —
  previously a popup could appear whose choice could never be injected.
- Every hold expiry is recorded in `~/.nexpath/nexpath.log` with how long preparation
  and the popup took, so a "popup vanished" report can be read from one line.
- Interaction signals recorded while a submit-time popup is open no longer compete with
  it for the local store; they are written after the hold with their original time.
- Cursor: the one-time "press Enter yourself" guidance (Windows: the editor could not be
  focused; macOS: Accessibility permission) now appears on Cursor as it did on Windsurf.
- Windows Cursor, first-run setup: the completion message now says to fully quit Cursor —
  a window reload does not load the newly registered hooks.
- macOS: the Full Disk Access notice names your editor (Windsurf, Devin, VS Code)
  instead of always "Cursor".
- macOS: the strengthened prompt is pasted and sent only after your editor has been brought
  to the front and confirmed as the frontmost app — nothing is typed blind into another
  window any more. If the editor cannot be brought to the front, you are told once to
  press Enter yourself.
- If no LLM credential is configured (the setup terminal's credential question can be
  skipped), the extension now says so once, with the two commands that fix it — instead of
  silently doing nothing on every prompt.
- The extension now records the same content-free interaction signals the CLI already
  records for its own popups — which action was taken and when, never any text. They
  are written locally through the CLI; nothing is sent anywhere unless you have turned
  telemetry on yourself, which is off by default.
- Internal comment and documentation cleanup. No change to how the extension behaves.
- Cursor and Windsurf: with more than one editor window open, the strengthened prompt
  could be pasted and sent into the wrong window. Sending brought whichever window the
  system happened to list first for that application to the front, so a prompt written in
  one window could be answered in another, and that other window would jump forward on its
  own. Sending now identifies this window by its own title, the folder name together with
  the editor name, and brings exactly that window forward before typing. This applies on
  Linux, Windows and macOS. If the window cannot be identified — an unusual window title,
  or no folder open — sending falls back to exactly what it did before, and a setup with a
  single editor window is unchanged on every platform.
- Windows: sending the strengthened prompt (paste, then Enter) no longer compiles the
  small window-targeting helper on every keystroke. The helper is compiled once, in the
  background when the extension starts, into `%LOCALAPPDATA%\nexpath\` and reused from
  there; if that file is missing it is compiled in place exactly as before. On the Windows
  machine measured earlier each compile cost about 0.8 s warm and 8 s cold, twice per
  send, which is why Windows waited far longer than Linux after Enter in the popup. The
  log now shows the time each keystroke script took and whether the cached helper was
  used (`helper=cached`). Behaviour is otherwise unchanged on every platform.
- Uninstalling the extension now cleans up after itself, like a first-class product:
  its entries in your editor's hooks file (`~/.cursor/hooks.json` or
  `~/.codeium/windsurf/hooks.json`; other tools' entries are left alone), its key in
  `~/.nexpath/submit-flow.json` and its heartbeat files are removed, and — only when no
  other editor still uses them — the staged CLI (`~/.nexpath/cli`, `~/.nexpath/bin`), the
  setup runner, `.setup-sentinel` and `session-env.json`. Your prompt store, credential
  and `nexpath.log` are never removed. Installing again then starts fresh: the Allow and
  Setup steps run as on a first install instead of being remembered from before. As VS
  Code defines it, the uninstall cleanup runs when the editor is next started after the
  uninstall — provided the editor's automatic extension update check
  (`extensions.autoCheckUpdates`, on by default) is enabled; with it off the editor never
  runs any extension's uninstall script. A line is written to
  `~/.nexpath/ext-uninstall.log` each time it runs.

## 0.1.35 — 2026-08-26

- Listing: the demo video is now linked at the top, next to what NexPath supports.

## 0.1.34 — 2026-08-25

- Popup selections now deliver within seconds in every case on Windows — a rare condition
  could previously delay the injected prompt by ~30 seconds.
- Windows Devin: one popup and one strengthened prompt per submission on builds that run
  both hook registrations — previously a submission could produce two.
- Windows: the first popup of a session injects and submits without the one-time
  half-minute warm-up delay.
- Windows: setup now completes cleanly for user accounts whose name contains a space
  (previously looped "dependencies incomplete" despite a healthy install).
- Refreshed the marketplace screenshot to show the submit-time flow.

## 0.1.33 — 2026-08-24

- **Prompt-submit guidance**: all popups now fire at the moment you submit a prompt on
  Cursor and Windsurf (Devin) — the prompt is held, a strengthened version is offered,
  and the version you choose is injected back and submitted for you. Only that runs.
- Windows support hardened end-to-end: hook payload parsing, workspace paths, keystroke
  targeting and timing, duplicate hook-registration handling.
- Per-editor setup verification with automatic self-heal, and clear guidance when a full
  editor restart is required.
- Delivery-timing fixes on all platforms so injected prompts never merge with pending
  ones or re-trigger guidance.
- Marketplace listing refreshed (GTM copy).

## 0.1.32 — 2026-06-29

- better-sqlite3 prebuilds for multiple Electron ABIs — works across Cursor/Windsurf
  Electron versions; per-IDE setup offer with a global CLI.

## 0.1.31

- User-facing README and marketplace metadata.

## 0.1.3

- First marketplace release (stable Cursor extension).
