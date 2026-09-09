# Changelog

## 0.1.36 — 2026-09-08

- Chat-history capture survives an editor update. Cursor and Windsurf ship their own
  runtime, and when they upgraded it the bundled database reader could no longer load,
  so capture stopped and the Output panel filled with a repeating
  "NODE_MODULE_VERSION" error every couple of seconds. The reader is now built on a
  runtime-independent interface, so the same build works on current and future editor
  versions.
- That same repeating failure was re-copying every chat database every two seconds,
  which slowed the editor down: on one machine a submit-time selection took nearly a
  minute to reach the chat. If the reader ever cannot load, it now reports once and
  stands down instead of retrying, and the submit popup and its delivery are unaffected.
- On an editor too old to run the reader safely, capture is skipped with a single
  explanatory line rather than risking a crash.
- Windsurf and Devin: your original prompt is no longer released while the popup is
  still open. If you take your time, the prompt is held and cancelled on your behalf,
  and whichever option you then choose is sent: the strengthened prompt, or your
  original text unchanged.
- The "schema is not recognised" notice no longer appears for an empty database, which
  the editor creates and removes routinely.

## 0.1.36 (earlier notes) — 2026-09-07

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
- The submit-time popup now waits for you. It used to close by itself after about
  75 seconds and let the held prompt run, which cut off anyone still reading the prepared
  text. Preparing the suggestion is still bounded (a stuck preparation never holds a prompt
  for long), but once the popup is open it stays until you choose — Enter, "use original",
  or Esc — for up to 30 minutes by default (`NEXPATH_SUBMIT_POPUP_WAIT_MS` overrides it). On
  Cursor the wait also never exceeds the hook timeout Nexpath registers, which setup now sets
  to 1900 seconds (it was 120); an install that has not re-run setup keeps the shorter, safe
  window until it does. `~/.nexpath/nexpath.log` records the granted window per turn as
  `cursor_hook_popup_budget` / `windsurf_hook_popup_budget`.
- The submit-time popup never shows a previous prompt's suggestion again. A suggestion
  prepared for one prompt could be left waiting (the extension not ready at that moment, the
  popup unable to open, a crash) and was then shown for the NEXT prompt that had none of its
  own — a tester saw the 3rd prompt's text in the 4th prompt's popup. Before opening a popup,
  anything prepared before the current prompt was received is now discarded; only a
  suggestion prepared for this prompt can be shown. `~/.nexpath/nexpath.log` records each
  discard as `submit_stop_decider_stale_rows_consumed`.
- Sending never types into another application any more. If you switch to a browser or a
  messenger while the strengthened prompt is being delivered, the paste and the Enter used
  to follow your focus into that window. Now, in the instant before each keystroke, the
  window in front is re-checked; if it is not this editor window — another application, or
  even a second window of the same editor — nothing is typed. A refused paste leaves the
  text on your clipboard and says so once; a refused Enter leaves it in the chat input with
  the existing "press Enter yourself" note. On Windows the delivery log now also records
  which window was in front when a keystroke was refused.
- Cursor and Windsurf: with more than one editor window open, the strengthened prompt
  could be pasted and sent into the wrong window. Sending brought whichever window the
  system happened to list first for that application to the front, so a prompt written in
  one window could be answered in another, and that other window would jump forward on its
  own. Sending now identifies this window by its own title, the folder name together with
  the editor name, and brings exactly that window forward before typing — on Windows also
  when another application (a browser, a messenger) is in front at that moment. Devin's
  window title, which puts the product name in the middle ("<folder> - Devin - <session>"),
  is recognised. This applies on Linux, Windows and macOS. If the window cannot be
  identified — an unusual window title, or no folder open — sending falls back to exactly
  what it did before, and a setup with a single editor window is unchanged on every platform.
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
