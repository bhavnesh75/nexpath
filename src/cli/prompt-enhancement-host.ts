import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  PromptEnhancementPrepareRequestV1,
  PromptEnhancementPrepareResultV1,
} from '../prompt-enhancement/contracts.js';
import {
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
} from '../prompt-enhancement/contracts.js';
import { validatePromptEnhancementCliPopupResultV1 } from '../prompt-enhancement/cli-submit-popup.js';
import { buildPromptEnhancementPopupRenderModelV1 } from '../prompt-enhancement/popup-render-model.js';
import { buildPromptEnhancementMpsContinuationPopupV1 } from '../prompt-enhancement/continuation-popup.js';
import {
  computeDockedPopupGeometry,
  detectScreenResolution,
  detectMacVisibleFrame,
  detectLinuxDisplayServerV1,
  wrapLinuxSpawnForWaylandX11V1,
  buildWindowsConsolePositionScriptV1,
  type PopupGeometry,
} from '../decision-session/screen-geometry.js';
import type {
  PromptEnhancementPopupHostInputV1,
  PromptEnhancementPopupHostOutputV1,
  PromptEnhancementMpsContinuationHostInputV1,
  PromptEnhancementMpsContinuationHostOutputV1,
} from './commands/prompt-enhancement-popup-host.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';
import {
  isPromptEnhancementCliMpsContinuationOutcomeV1,
  type PromptEnhancementCliMpsContinuationOutcomeV1,
} from '../prompt-enhancement/cli-mps-continuation-run.js';
import type { PromptEnhancementSequencePackagedContinuationV1 } from '../prompt-enhancement/sequence-packager.js';

export const PROMPT_ENHANCEMENT_LINUX_TERMINAL_COMMANDS_V1 = [
  'xdg-terminal-exec',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'kitty',
  'alacritty',
  'wezterm',
  'foot',
  'x-terminal-emulator',
  'xterm',
] as const;

export type PromptEnhancementLinuxTerminalCommandV1 =
  (typeof PROMPT_ENHANCEMENT_LINUX_TERMINAL_COMMANDS_V1)[number];

/** Linux display server, for choosing how the popup window is positioned. */
export type PromptEnhancementLinuxDisplayServerV1 = 'x11' | 'wayland' | 'unknown';

/**
 * Detect the Linux display server from the environment (P4). `XDG_SESSION_TYPE` is authoritative
 * when present; otherwise infer from `WAYLAND_DISPLAY` / `DISPLAY`. Pure — exported for testability.
 * Matters because GTK terminals (gnome-terminal, xfce4-terminal) default to NATIVE Wayland, where
 * the `--geometry` position offset is IGNORED; forcing GDK_BACKEND=x11 routes them through XWayland
 * (shipped by default on recent Ubuntu), where `--geometry` positions correctly.
 */
export function detectPromptEnhancementLinuxDisplayServerV1(
  env: NodeJS.ProcessEnv = process.env,
): PromptEnhancementLinuxDisplayServerV1 {
  // Delegates to the shared decision-session helper (P5) — one implementation for both layers.
  return detectLinuxDisplayServerV1(env);
}

export type PromptEnhancementCliHostCapabilityV1 =
  | {
      state: 'available';
      method: 'direct_tty';
    }
  | {
      state: 'available';
      method: 'linux_terminal';
      terminalCommand: PromptEnhancementLinuxTerminalCommandV1;
    }
  | {
      // Windows: the popup is rendered in a NEW console window spawned via `cmd /c start` (the Stop
      // hook has no usable in-process console). Mirrors the advisory's Windows path.
      state: 'available';
      method: 'windows_terminal';
    }
  | {
      // macOS: the popup is rendered in a NEW Terminal.app window spawned via `osascript` (the Stop
      // hook may have no usable /dev/tty). Mirrors the advisory's macOS path.
      state: 'available';
      method: 'mac_terminal';
    }
  | {
      state: 'unavailable';
      method: 'none';
      reasonCode: 'unsupported_platform' | 'no_gui_session' | 'no_supported_terminal';
    };

export interface PromptEnhancementCliHostProbeDependenciesV1 {
  platform?: NodeJS.Platform;
  env?: Pick<NodeJS.ProcessEnv, 'DISPLAY' | 'WAYLAND_DISPLAY' | 'NEXPATH_POPUP_DOCK'>;
  probeDirectTty?: () => boolean;
  commandExists?: (command: PromptEnhancementLinuxTerminalCommandV1) => boolean;
  readCommandVersion?: (command: PromptEnhancementLinuxTerminalCommandV1) => string | undefined;
}

// Owner decision: the PE popup has NO timeout — the host waits for the user
// indefinitely. The poll loop only ends when the renderer writes a result or the
// terminal exits; there is no deadline.
const PROMPT_ENHANCEMENT_POPUP_HOST_POLL_INTERVAL_MS_V1 = 50;
const PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1 = 1;
const PROMPT_ENHANCEMENT_POPUP_WINDOW_TITLE_V1 = 'Nexpath · Prompt enhancement';

export interface PromptEnhancementLinuxTerminalLaunchPlanV1 {
  // A bare argv: `command` is the program to spawn and `args` its arguments. Widened to `string` so
  // the Windows launcher can use `cmd.exe` (the Linux plan still returns a terminal-command name).
  command: string;
  args: readonly string[];
}

export type PromptEnhancementCliPopupHostLaunchResultV1 =
  | { state: 'not_applicable'; reasonCode: 'direct_tty' }
  | { state: 'host_unavailable'; reasonCode: 'unsupported_platform' | 'no_gui_session' | 'no_supported_terminal' }
  | { state: 'launch_failed'; reasonCode: 'terminal_spawn_failed' | 'terminal_exit_nonzero' | 'terminal_renderer_not_ready' }
  // Blink fix: the launcher rejects a payload here instead of spawning a terminal that the child would
  // exit from before rendering (an open-then-close "blink"). Callers treat it exactly like any non-
  // `completed` result. Two reasons:
  //  - `payload_invalid_pre_spawn`      : failed the SAME validators the child runs (structural), or the
  //                                       request/result identity cross-check the child also enforces.
  //  - `render_decision_no_popup`       : structurally valid, but the SAME render decision the child makes
  //                                       resolves to `no_popup` (e.g. a `no_popup_not_applicable`
  //                                       disposition from a missing key) — the child would decline to
  //                                       render, so no window is opened.
  | { state: 'not_shown'; reasonCode: 'payload_invalid_pre_spawn' | 'render_decision_no_popup'; validationReasonCodes: readonly string[] }
  | { state: 'completed'; output: PromptEnhancementPopupHostOutputV1 };

interface PromptEnhancementSpawnedTerminalV1 {
  unref(): void;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export interface PromptEnhancementCliPopupHostLaunchDependenciesV1 {
  makeTempDir: () => string;
  writeInputFile: (path: string, input: PromptEnhancementPopupHostInputV1) => void;
  spawnTerminal: (plan: PromptEnhancementLinuxTerminalLaunchPlanV1) => Promise<PromptEnhancementSpawnedTerminalV1>;
  readResultFile: (path: string) => PromptEnhancementPopupHostOutputV1 | undefined;
  readReadyFile: (path: string) => boolean;
  sleep: (milliseconds: number) => Promise<void>;
  cleanupTempDir: (path: string) => void;
  detectPopupGeometry: () => Promise<PopupGeometry | undefined>;
}

function probeDirectTty(): boolean {
  // Mirror the popup's console open (cli-submit-popup.ts): Linux + macOS use /dev/tty; Windows uses
  // the console device (CONIN$ for input, CONOUT$ for output). Probe the same device(s) so this
  // capability accurately predicts whether the popup can attach.
  const fds: number[] = [];
  try {
    if (process.platform === 'win32') {
      fds.push(openSync('\\\\.\\CONIN$', 'r'));
      fds.push(openSync('\\\\.\\CONOUT$', 'w'));
    } else {
      fds.push(openSync('/dev/tty', 'r+'));
    }
    return true;
  } catch {
    return false;
  } finally {
    for (const fd of fds) {
      try {
        closeSync(fd);
      } catch {
        // A failed capability-probe cleanup must not crash the hook.
      }
    }
  }
}

function commandExists(command: PromptEnhancementLinuxTerminalCommandV1): boolean {
  const result = spawnSync('which', [command], {
    stdio: 'ignore',
    timeout: 2_000,
  });
  return result.status === 0;
}

function readCommandVersion(command: PromptEnhancementLinuxTerminalCommandV1): string | undefined {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 2_000,
  });
  return typeof result.stdout === 'string' ? result.stdout : undefined;
}

function supportsBlockingGnomeTerminal(version: string | undefined): boolean {
  const match = version?.match(/(\d+)\.(\d+)/);
  if (!match) return true;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  return major > 3 || (major === 3 && minor >= 36);
}

/**
 * Resolve only the interactive surface available to the PE CLI consumer.
 *
 * The resolver performs no rendering or launching. It is intentionally
 * separate from Decision Session UI/state and fails closed to a typed reason.
 */
export function resolvePromptEnhancementCliHostCapabilityV1(
  dependencies: PromptEnhancementCliHostProbeDependenciesV1 = {},
): PromptEnhancementCliHostCapabilityV1 {
  const platform = dependencies.platform ?? process.platform;
  if (platform === 'win32') {
    // Windows: the Stop hook has no usable in-process console — opening CONIN$/CONOUT$ there renders
    // to a NON-VISIBLE console, so the popup "shows" invisibly. Always spawn a new window instead
    // (mirrors the advisory's `cmd /c start`); the child renders in that window's real console.
    return { state: 'available', method: 'windows_terminal' };
  }
  if (platform === 'darwin') {
    // macOS: always spawn a new Terminal.app window (mirrors the advisory's osascript path) — the Stop
    // hook may have no usable in-process /dev/tty, so never rely on it. Matches the old popup's
    // all-platform "always a spawned window" behaviour.
    return { state: 'available', method: 'mac_terminal' };
  }
  if (platform !== 'linux') {
    return { state: 'unavailable', method: 'none', reasonCode: 'unsupported_platform' };
  }

  // Linux: prefer the in-process /dev/tty when the hook has a controlling terminal, otherwise spawn a
  // GUI terminal below (unchanged behaviour). Opt-in force-dock (P4, owner request 2026-08-08): when
  // NEXPATH_POPUP_DOCK is set AND a GUI session exists, prefer a spawned right-docked WINDOW over the
  // in-terminal /dev/tty render — so Ubuntu users can get the Windows/macOS-style docked window on
  // demand. The default (env unset) is UNCHANGED — direct-TTY still wins — honouring the locked
  // "preserve Linux popup behaviour" rule. Fail-open: if force-dock finds no spawnable terminal, the
  // in-process /dev/tty is still used as a last resort rather than losing the popup.
  const directTtyAvailable = dependencies.probeDirectTty ?? probeDirectTty;
  const env = dependencies.env ?? process.env;
  const tryDirectTty = (): PromptEnhancementCliHostCapabilityV1 | null => {
    try {
      if (directTtyAvailable()) return { state: 'available', method: 'direct_tty' };
    } catch { /* fall through */ }
    return null;
  };
  const forceDock = (env.NEXPATH_POPUP_DOCK ?? '').trim().length > 0;
  const guiSession = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);

  if (!forceDock) {
    const dt = tryDirectTty();
    if (dt) return dt;
  }

  if (!guiSession) {
    // No GUI session → only the in-process /dev/tty can render (even under force-dock).
    const dt = tryDirectTty();
    if (dt) return dt;
    return { state: 'unavailable', method: 'none', reasonCode: 'no_gui_session' };
  }

  const hasCommand = dependencies.commandExists ?? commandExists;
  const getVersion = dependencies.readCommandVersion ?? readCommandVersion;
  for (const terminalCommand of PROMPT_ENHANCEMENT_LINUX_TERMINAL_COMMANDS_V1) {
    let available = false;
    try {
      available = hasCommand(terminalCommand);
    } catch {
      continue;
    }
    if (!available) continue;

    if (terminalCommand === 'gnome-terminal') {
      let version: string | undefined;
      try {
        version = getVersion(terminalCommand);
      } catch {
        version = undefined;
      }
      if (!supportsBlockingGnomeTerminal(version)) continue;
    }

    return { state: 'available', method: 'linux_terminal', terminalCommand };
  }

  // Force-dock reached here having skipped the direct-TTY check but found no spawnable terminal —
  // fall back to the in-process /dev/tty rather than losing the popup (fail-open). For the
  // non-force-dock path direct-TTY was already tried above, so this is a harmless no-op there.
  const dt = tryDirectTty();
  if (dt) return dt;
  return { state: 'unavailable', method: 'none', reasonCode: 'no_supported_terminal' };
}

/**
 * Build only the generic Linux terminal argv for the already-resolved PE host.
 * The request/result body is private-file data and never becomes an argv value.
 */
export function planPromptEnhancementLinuxTerminalLaunchV1(input: {
  terminalCommand: PromptEnhancementLinuxTerminalCommandV1;
  nodePath: string;
  cliEntryPath: string;
  inputFile: string;
  resultFile: string;
  readinessFile: string;
  dbPath: string;
  /** Right-docked popup window geometry (~60% width × 100% height); omitted → the terminal's default size. */
  geometry?: PopupGeometry;
  /** Display server (P4). On Wayland, GTK terminals are wrapped with GDK_BACKEND=x11 so --geometry positions via XWayland. */
  displayServer?: PromptEnhancementLinuxDisplayServerV1;
}): PromptEnhancementLinuxTerminalLaunchPlanV1 {
  const childArgs = [
    input.nodePath,
    input.cliEntryPath,
    'prompt-enhancement-popup-host',
    '--input-file', input.inputFile,
    '--result-file', input.resultFile,
    '--readiness-file', input.readinessFile,
    '--db', input.dbPath,
  ];

  // Size + position the popup window to the supplied right-docked geometry, using each
  // emulator's native flag (char cells + `+x+y` offset for X11-style; pixels for kitty/foot,
  // which are size-only — position is WM/compositor-controlled there). Reused from the
  // decision-session screen-geometry pattern.
  const g = input.geometry;
  const cellGeom = g ? [`--geometry=${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`] : [];
  const xtermGeom = g ? ['-geometry', `${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`] : [];
  const kittyGeom = g ? ['-o', `initial_window_width=${g.widthPx}px`, '-o', `initial_window_height=${g.heightPx}px`, '-o', 'remember_window_size=no'] : [];
  const alacrittyGeom = g ? ['--dimensions', `${g.cols}`, `${g.rows}`] : [];
  const footGeom = g ? [`--window-size-pixels=${g.widthPx}x${g.heightPx}`] : [];
  const T = PROMPT_ENHANCEMENT_POPUP_WINDOW_TITLE_V1;

  const plan: PromptEnhancementLinuxTerminalLaunchPlanV1 = ((): PromptEnhancementLinuxTerminalLaunchPlanV1 => {
    switch (input.terminalCommand) {
      case 'xdg-terminal-exec':
        return { command: input.terminalCommand, args: childArgs };
      case 'gnome-terminal':
        return { command: input.terminalCommand, args: ['--wait', `--title=${T}`, ...cellGeom, '--', ...childArgs] };
      case 'konsole':
        return { command: input.terminalCommand, args: ['-p', `tabtitle=${T}`, '-e', ...childArgs] };
      case 'xfce4-terminal':
        return { command: input.terminalCommand, args: ['--disable-server', `--title=${T}`, ...cellGeom, '-x', ...childArgs] };
      case 'kitty':
        return { command: input.terminalCommand, args: [...kittyGeom, '--title', T, ...childArgs] };
      case 'alacritty':
        return { command: input.terminalCommand, args: [...alacrittyGeom, '--title', T, '-e', ...childArgs] };
      case 'wezterm':
        return { command: input.terminalCommand, args: ['start', '--', ...childArgs] };
      case 'foot':
        return { command: input.terminalCommand, args: [...footGeom, `--title=${T}`, ...childArgs] };
      case 'x-terminal-emulator':
        return { command: input.terminalCommand, args: ['-e', ...childArgs] };
      case 'xterm':
        return { command: input.terminalCommand, args: [...xtermGeom, '-T', T, '-e', ...childArgs] };
    }
  })();

  // Wayland positioning (P4): GTK terminals (gnome-terminal, xfce4-terminal) default to NATIVE
  // Wayland, where the `--geometry` position offset is ignored. Only when we actually have a docked
  // geometry to apply, run them through XWayland via `env GDK_BACKEND=x11 …` so `--geometry`
  // positions the window. XWayland ships by default on recent Ubuntu. On X11 / unknown sessions this
  // wrap is not applied (native geometry already works); non-GTK terminals are left untouched
  // (xterm is already XWayland; kitty/foot/alacritty are size-only under Wayland by design).
  return wrapLinuxSpawnForWaylandX11V1(plan, {
    displayServer: input.displayServer ?? 'unknown',
    terminalCommand: input.terminalCommand,
    hasGeometry: Boolean(input.geometry),
  });
}

/**
 * The batch launcher executed inside the spawned Windows console window. Every path is double-quoted
 * so cmd.exe handles spaces natively — no reliance on `start`/argv escaping, which is fragile for
 * space-containing paths (e.g. a clone under "nexpath testing\"). Node is invoked by its ABSOLUTE
 * path, so it does not depend on the new window's PATH. This is the robust, standard way to launch a
 * child process with arbitrary paths on Windows.
 */
export function buildPromptEnhancementWindowsLauncherScriptV1(input: {
  nodeExecPath: string;
  cliEntryPath: string;
  inputFile: string;
  resultFile: string;
  readinessFile: string;
  dbPath: string;
  /** Right-dock geometry (P3). When present the launcher sizes the console (mode con) before node. */
  geometry?: PopupGeometry;
  /** Path to the sibling MoveWindow .ps1 (P3). When present, run it best-effort to position the window. */
  positionScriptPath?: string;
}): string {
  // Paths never legitimately contain a double-quote; strip any defensively so the quoting can't be
  // broken out of (the request body itself is passed as a file, never on this command line).
  const quote = (p: string): string => `"${p.replace(/"/g, '')}"`;
  const command = [
    quote(input.nodeExecPath),
    quote(input.cliEntryPath),
    'prompt-enhancement-popup-host',
    '--input-file', quote(input.inputFile),
    '--result-file', quote(input.resultFile),
    '--readiness-file', quote(input.readinessFile),
    '--db', quote(input.dbPath),
  ].join(' ');
  // `@echo off` for a clean window; CRLF line endings for a well-formed .cmd.
  const lines = ['@echo off'];
  // Right-dock (P3, fail-open): size the console in CELLS via `mode con` (reliable, no quoting),
  // then POSITION it via the sibling MoveWindow .ps1 run best-effort (`2>nul`, no errorlevel stop —
  // a missing/blocked PowerShell just leaves the sized-but-default-positioned window). Both run
  // BEFORE node, in the same console, so the whole `cmd /c start /WAIT` + polling wait model is
  // unchanged. Omitting geometry → today's behaviour exactly (no sizing/positioning).
  if (input.geometry) {
    lines.push(`mode con: cols=${input.geometry.cols} lines=${input.geometry.rows}`);
    if (input.positionScriptPath) {
      lines.push(`powershell -NoProfile -ExecutionPolicy Bypass -File ${quote(input.positionScriptPath)} 2>nul`);
    }
  }
  lines.push(command);
  // On a real error (non-zero exit) `pause` keeps the window open so the message is visible instead
  // of the window flashing and vanishing (better UX + diagnosis).
  lines.push('if errorlevel 1 pause', '');
  return lines.join('\r\n');
}

/**
 * The PowerShell script (written as a sibling .ps1, run via `-File`) that right-docks the popup's
 * console window. Uses GetConsoleWindow (kernel32) + MoveWindow (user32) to move+size the CURRENT
 * console to the docked pixel rect. Written as a separate file so there is NO batch↔PowerShell↔C#
 * quoting to get wrong; `$ErrorActionPreference = SilentlyContinue` + the caller's `2>nul` make it
 * fully fail-open (a failure leaves the mode-con-sized window at its default position). Pure.
 */
export function buildPromptEnhancementWindowsPositionScriptV1(geometry: PopupGeometry): string {
  // Delegates to the shared decision-session helper (P5) — one MoveWindow implementation.
  return buildWindowsConsolePositionScriptV1(geometry);
}

/**
 * Windows popup launch: open a NEW console window that runs the batch launcher above, via
 * `cmd /c start /WAIT "<title>" cmd /c "<launcher.cmd>"`.
 *
 * IMPORTANT: `start` must run a *program* (here `cmd /c <launcher.cmd>`), NOT the `.cmd` file directly.
 * `start "<title>" "<launch.cmd>"` routes the `.cmd` through ShellExecute's file association, which
 * fails on real Windows with "The system cannot find the path specified." — this is exactly the shape
 * the working advisory popup uses (`start … node <script>` runs a program too). The launcher path is
 * in a temp dir (no spaces), so `start` needs no fragile quoting; every real, possibly-space-containing
 * path is quoted INSIDE the batch. `/WAIT` keeps the parent alive until the window closes; the child
 * renders in that window's real, visible console.
 */
export function planPromptEnhancementWindowsTerminalLaunchV1(input: {
  launcherScriptPath: string;
  /**
   * No-jump (P6): open the window MINIMIZED (`start /MIN`) so it never flashes at the default centre;
   * the launcher's position .ps1 then restores it directly to the docked rect (SetWindowPlacement).
   * Set only when a docked geometry + position script are present; omitted → today's normal spawn.
   */
  minimized?: boolean;
}): PromptEnhancementLinuxTerminalLaunchPlanV1 {
  const startFlags = input.minimized ? ['start', '/MIN', '/WAIT'] : ['start', '/WAIT'];
  return {
    // Resolve the command interpreter from the system (`%ComSpec%`) rather than assuming a fixed
    // `cmd.exe` on PATH — this works across non-standard Windows installs and locales. Falls back to
    // the on-PATH `cmd.exe` only if the env var is absent.
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/c', ...startFlags, PROMPT_ENHANCEMENT_POPUP_WINDOW_TITLE_V1, 'cmd', '/c', input.launcherScriptPath],
  };
}

/**
 * The shell launcher executed inside the spawned macOS Terminal.app window. Every path is
 * single-quoted so /bin/sh handles spaces natively, and node is invoked by its ABSOLUTE path — the
 * same robust approach as the Windows batch launcher (no fragile inline quoting).
 */
export function buildPromptEnhancementMacLauncherScriptV1(input: {
  nodeExecPath: string;
  cliEntryPath: string;
  inputFile: string;
  resultFile: string;
  readinessFile: string;
  dbPath: string;
}): string {
  // Paths never legitimately contain a single-quote; strip any defensively so the sh quoting holds.
  const quote = (p: string): string => `'${p.replace(/'/g, '')}'`;
  const command = [
    quote(input.nodeExecPath),
    quote(input.cliEntryPath),
    'prompt-enhancement-popup-host',
    '--input-file', quote(input.inputFile),
    '--result-file', quote(input.resultFile),
    '--readiness-file', quote(input.readinessFile),
    '--db', quote(input.dbPath),
  ].join(' ');
  // Clear the terminal (the same reset the popup itself uses) as the FIRST launcher step, so the login
  // shell's greeting ("Last login…") and the echoed launch command are wiped BEFORE node renders the
  // popup — otherwise they flash above the popup in the spawned Terminal.app window (live iMac report
  // 2026-08-19). Uses a printf escape rather than `clear` so it does not depend on the clear binary.
  return ['#!/bin/sh', "printf '\\033[2J\\033[3J\\033[H'", command, ''].join('\n');
}

/**
 * AppleScript that opens a new Terminal.app window, runs `shellCommand; exit`, waits for it to finish,
 * then closes the window. Replicated from the advisory's buildTerminalAppleScript so the PE host does
 * not import the heavy decision-session tty module.
 */
function buildPromptEnhancementMacAppleScriptV1(shellCommand: string, geom: PopupGeometry | null): string {
  const escaped = shellCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // Right-dock (mac fix 2026-08-08): position AFTER a short settle delay and set the bounds on the
  // tab's window a second time, because setting bounds the instant `do script` returns is a race —
  // the window often isn't ready yet, the `try` swallows the failure, and Terminal keeps its default
  // (centred) window (live iMac report). A ~0.35s settle + a re-apply makes the right-dock stick.
  const sizeBlock = geom
    ? `delay 0.35
    try
        set bounds of (first window whose selected tab is theTab) to {${geom.xPx}, ${geom.yPx}, ${geom.xPx + geom.widthPx}, ${geom.yPx + geom.heightPx}}
    end try
    delay 0.15
    try
        set bounds of (first window whose selected tab is theTab) to {${geom.xPx}, ${geom.yPx}, ${geom.xPx + geom.widthPx}, ${geom.yPx + geom.heightPx}}
    end try`
    : 'set number of rows of (first window whose selected tab is theTab) to 50';
  return `tell application "Terminal"
    activate
    set theTab to do script "${escaped}; exit"
    ${sizeBlock}
    delay 1
    repeat
        delay 0.5
        try
            if not (busy of theTab) then exit repeat
        on error
            exit repeat
        end try
    end repeat
    try
        close (first window whose selected tab is theTab)
    end try
end tell`;
}

/**
 * macOS popup launch: open a NEW Terminal.app window (via `osascript`) that runs the shell launcher
 * above through `sh`. The launcher path lives in a temp dir (no spaces), so the AppleScript embedding
 * is clean; every real, possibly-space-containing path is quoted INSIDE the launcher. osascript is
 * synchronous — the AppleScript waits for the child to finish, then closes the window. Mirrors the
 * advisory's macOS path.
 */
export function planPromptEnhancementMacTerminalLaunchV1(input: {
  launcherScriptPath: string;
  geometry?: PopupGeometry;
}): PromptEnhancementLinuxTerminalLaunchPlanV1 {
  const shCommand = `sh '${input.launcherScriptPath.replace(/'/g, '')}'`;
  return {
    command: 'osascript',
    args: ['-e', buildPromptEnhancementMacAppleScriptV1(shCommand, input.geometry ?? null)],
  };
}

function makeTempDir(): string {
  const dir = join(tmpdir(), `nexpath-pe-popup-host-${randomUUID()}`);
  mkdirSync(dir, { mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

function writeInputFile(path: string, input: PromptEnhancementPopupHostInputV1): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(input), 'utf8');
    chmodSync(path, 0o600);
  } finally {
    closeSync(fd);
  }
}

function readReadyFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return lstatSync(path).isFile() && readFileSync(path, 'utf8') === 'ready';
  } catch {
    return false;
  }
}

function readResultFile(path: string): PromptEnhancementPopupHostOutputV1 | undefined {
  if (!existsSync(path)) return undefined;
  try {
    if (!lstatSync(path).isFile()) return undefined;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const output = parsed as Record<string, unknown>;
    if (output.protocolVersion !== PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1) return undefined;
    if (!validatePromptEnhancementCliPopupResultV1(output.result)) return undefined;
    return {
      protocolVersion: PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1,
      result: output.result,
      // MPS Phase 1 (Option 2): carry the parent-records flag across the IPC boundary (default false).
      mpsFirstPopupSent: output.mpsFirstPopupSent === true,
    };
  } catch {
    return undefined;
  }
}

// MPS Phase 2 (Option D) — the continuation host's private input/output file I/O, mirroring the
// first-popup pair above. Same atomic-write + strict-read discipline; only the payload shape differs.
function writeContinuationInputFile(path: string, input: PromptEnhancementMpsContinuationHostInputV1): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(input), 'utf8');
    chmodSync(path, 0o600);
  } finally {
    closeSync(fd);
  }
}

function readContinuationResultFile(path: string): PromptEnhancementMpsContinuationHostOutputV1 | undefined {
  if (!existsSync(path)) return undefined;
  try {
    if (!lstatSync(path).isFile()) return undefined;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const output = parsed as Record<string, unknown>;
    if (output.protocolVersion !== PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1) return undefined;
    // Validate the reported outcome from the single canonical source; a malformed/incomplete outcome
    // reads back as undefined, which the launcher surfaces as a failed launch (fail-closed).
    if (!isPromptEnhancementCliMpsContinuationOutcomeV1(output.continuationOutcome)) return undefined;
    return {
      protocolVersion: PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1,
      continuationOutcome: output.continuationOutcome as PromptEnhancementCliMpsContinuationOutcomeV1,
    };
  } catch {
    return undefined;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function spawnTerminal(plan: PromptEnhancementLinuxTerminalLaunchPlanV1): Promise<PromptEnhancementSpawnedTerminalV1> {
  const child = spawn(plan.command, [...plan.args], { detached: true, stdio: 'ignore', shell: false });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  return child;
}

function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

function defaultLaunchDependencies(): PromptEnhancementCliPopupHostLaunchDependenciesV1 {
  return {
    makeTempDir,
    writeInputFile,
    spawnTerminal,
    readResultFile,
    readReadyFile,
    sleep,
    cleanupTempDir,
    detectPopupGeometry: async () => {
      try {
        // Right-dock geometry (owner request 2026-08-08): ~60% width × 100% height, flush right.
        // Fail-open exactly as before — detection failure → undefined → the emulator's default size.
        // macOS (fix 2026-08-08): prefer the VISIBLE FRAME (excludes menu bar + Dock) so the docked
        // window sits below the menu bar and above the Dock; falls back to full screen.
        if (process.platform === 'darwin') {
          const visibleFrame = detectMacVisibleFrame();
          if (visibleFrame) return computeDockedPopupGeometry(visibleFrame);
        }
        const screen = await detectScreenResolution();
        return screen
          ? computeDockedPopupGeometry({ x: 0, y: 0, widthPx: screen.widthPx, heightPx: screen.heightPx })
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Launch the already-built hidden popup child through a resolved Linux terminal
 * and exchange only private typed files. It does not decide hook output or
 * mutate PE semantics; PE1.3 returns transport status for the later adapter.
 *
 * Blink fix (Phases 1–3): before spawning, this runs the SAME two validators the child runs
 * (validatePromptEnhancementPrepareRequestV1 + validatePromptEnhancementPrepareResultV1). An invalid
 * payload returns `{ state: 'not_shown', reasonCode: 'payload_invalid_pre_spawn', validationReasonCodes }`
 * WITHOUT opening a window — otherwise the spawned terminal would open and the child would exit before
 * rendering (an open-then-close "blink"). The sibling continuation launcher below applies a narrowed,
 * presence-only structural gate (same reasonCode) so a valid confirmation item is never over-rejected.
 * `direct_tty` and the valid-payload spawn path are unchanged. Reason codes: `payload_invalid_pre_spawn`
 * (this gate) vs. `terminal_spawn_failed` / `terminal_exit_nonzero` / `terminal_renderer_not_ready`
 * (a genuine spawn/render failure AFTER a valid payload).
 */
export async function runPromptEnhancementCliPopupHostLaunchV1(input: {
  capability: PromptEnhancementCliHostCapabilityV1;
  request: PromptEnhancementPrepareRequestV1;
  result: PromptEnhancementPrepareResultV1;
  cliEntryPath: string;
  dbPath: string;
  nodePath?: string;
  /** Carried through to the child unchanged; absent on a caller that has none. */
  emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
}, overrides: Partial<PromptEnhancementCliPopupHostLaunchDependenciesV1> = {}): Promise<PromptEnhancementCliPopupHostLaunchResultV1> {
  if (input.capability.state === 'unavailable') {
    return { state: 'host_unavailable', reasonCode: input.capability.reasonCode };
  }
  if (input.capability.method === 'direct_tty') return { state: 'not_applicable', reasonCode: 'direct_tty' };

  // Pre-spawn validity gate (blink fix, Phase 1): run the SAME two validators the spawned child runs
  // (prompt-enhancement-popup-host.ts `validatedInput`) BEFORE opening a window. An invalid payload —
  // e.g. the OpenAI key is missing, so the enhancement is an invalid fallback — would otherwise open a
  // terminal window that the child immediately exits from before rendering: an open-then-close "blink".
  // Rejecting it here yields the SAME not-shown outcome the caller already produces for any non-
  // `completed` launch, with no wasted flashing window. The valid-payload path below is unchanged.
  const requestCheck = validatePromptEnhancementPrepareRequestV1(input.request);
  const resultCheck = validatePromptEnhancementPrepareResultV1(input.result);
  if (!requestCheck.ok || !resultCheck.ok) {
    return {
      state: 'not_shown',
      reasonCode: 'payload_invalid_pre_spawn',
      validationReasonCodes: [...requestCheck.reasonCodes, ...resultCheck.reasonCodes],
    };
  }

  // Cross-field identity parity with the child's `validatedInput` (prompt-enhancement-popup-host.ts):
  // request and result must describe the SAME enhancement. A mismatch is structurally valid on each
  // side but makes the child exit as `input_invalid_or_stale` after the window opened — the same blink —
  // so reject it here (same `payload_invalid_pre_spawn` bucket) before spawning.
  if (input.request.requestId !== input.result.requestId
      || input.request.projectRoot !== input.result.projectRoot) {
    return {
      state: 'not_shown',
      reasonCode: 'payload_invalid_pre_spawn',
      validationReasonCodes: ['request_result_identity_mismatch'],
    };
  }

  // Display-decision pre-spawn gate (blink fix): run the SAME render decision the spawned child runs
  // (`buildPromptEnhancementPopupRenderModelV1`, identical arguments) BEFORE opening a window. A
  // structurally-valid but non-displayable payload — e.g. a `no_popup_not_applicable` disposition or a
  // `no_popup` send policy from a missing key — would otherwise open a terminal the child immediately
  // declines (`no_popup`) before rendering: the open-then-close "blink". Deciding it here yields the SAME
  // not-shown outcome with no wasted window. It is pure parity with the child, so it never suppresses a
  // popup the child would have shown, nor spawns one it would have declined.
  const renderDecision = buildPromptEnhancementPopupRenderModelV1({
    result: input.result,
    timestampMs: Date.now(),
    deliverySurface: input.result.delivery.deliveryChannel,
  });
  if (renderDecision.state === 'no_popup') {
    return {
      state: 'not_shown',
      reasonCode: 'render_decision_no_popup',
      validationReasonCodes: renderDecision.reasonCodes,
    };
  }

  const dependencies = { ...defaultLaunchDependencies(), ...overrides };
  const tempDir = dependencies.makeTempDir();
  const inputFile = join(tempDir, 'input.json');
  const resultFile = join(tempDir, 'result.json');
  const readinessFile = join(tempDir, 'ready');
  let child: PromptEnhancementSpawnedTerminalV1 | undefined;
  let terminalExitNonZero = false;
  let rendererReady = false;

  try {
    const childInput: PromptEnhancementPopupHostInputV1 = {
      protocolVersion: PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1,
      request: input.request,
      result: input.result,
      ...(input.emphasisPhrases ? { emphasisPhrases: input.emphasisPhrases } : {}),
    };
    dependencies.writeInputFile(inputFile, childInput);
    const geometry = await dependencies.detectPopupGeometry();
    let plan: PromptEnhancementLinuxTerminalLaunchPlanV1;
    if (input.capability.method === 'windows_terminal') {
      // Write the batch launcher into the temp dir (cleaned up in `finally`), then spawn a window
      // that runs it. All real paths are quoted inside the batch, so the spawn command stays clean.
      const launcherScriptPath = join(tempDir, 'launch.cmd');
      // Right-dock (P3): when geometry is known, write a sibling MoveWindow .ps1 and have the
      // launcher size (mode con) + position (that .ps1, best-effort) the window before node. When
      // geometry is undefined (detection failed) the launcher is byte-identical to before.
      let positionScriptPath: string | undefined;
      if (geometry) {
        positionScriptPath = join(tempDir, 'position.ps1');
        writeFileSync(positionScriptPath, buildPromptEnhancementWindowsPositionScriptV1(geometry), 'utf8');
      }
      const launcherScript = buildPromptEnhancementWindowsLauncherScriptV1({
        nodeExecPath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
        geometry,
        positionScriptPath,
      });
      writeFileSync(launcherScriptPath, launcherScript, 'utf8');
      if (process.env.NEXPATH_DEBUG) process.stderr.write(`[nexpath] launch.cmd (${launcherScriptPath}):\n${launcherScript}\n`);
      // Windows visible-launch fix (2026-08-09): open the window VISIBLE, never minimized. The P6
      // no-jump minimize left the popup stuck in the taskbar whenever the best-effort PowerShell
      // restore did not take effect (Win11 + Windows Terminal: GetConsoleWindow targets the hidden
      // pseudo-console, not the real window; or PowerShell blocked). The position .ps1 still docks the
      // now-visible window best-effort — worst case is a brief flash-then-dock, never an invisible popup.
      plan = planPromptEnhancementWindowsTerminalLaunchV1({ launcherScriptPath });
    } else if (input.capability.method === 'mac_terminal') {
      // Write the shell launcher (0o700) into the temp dir, then open a Terminal.app window that runs
      // it. All real paths are quoted inside the launcher, so the AppleScript stays clean.
      const launcherScriptPath = join(tempDir, 'launch.sh');
      writeFileSync(launcherScriptPath, buildPromptEnhancementMacLauncherScriptV1({
        nodeExecPath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
      }), { mode: 0o700 });
      plan = planPromptEnhancementMacTerminalLaunchV1({ launcherScriptPath, geometry });
    } else {
      plan = planPromptEnhancementLinuxTerminalLaunchV1({
        terminalCommand: input.capability.terminalCommand,
        nodePath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        geometry,
        // P4: detect X11 vs Wayland so GTK terminals get GDK_BACKEND=x11 (XWayland) on Wayland,
        // where --geometry positioning is otherwise ignored (recent Ubuntu default).
        displayServer: detectPromptEnhancementLinuxDisplayServerV1(),
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
      });
    }
    if (process.env.NEXPATH_DEBUG) {
      process.stderr.write(`[nexpath] PE popup spawn: ${plan.command} ${JSON.stringify(plan.args)}\n`);
    }
    let childExited = false;
    try {
      child = await dependencies.spawnTerminal(plan);
      child.once('exit', (code, signal) => {
        childExited = true;
        terminalExitNonZero = code !== 0 || signal !== null;
      });
    } catch {
      return { state: 'launch_failed', reasonCode: 'terminal_spawn_failed' };
    }

    // No deadline — the popup waits for the user indefinitely (owner decision).
    // The loop ends only when the renderer writes a result, or the terminal
    // exits without one (crash / window closed emits a non-zero exit or signal).
    for (;;) {
      rendererReady ||= dependencies.readReadyFile(readinessFile);
      const output = dependencies.readResultFile(resultFile);
      if (output) {
        if (!rendererReady) return { state: 'launch_failed', reasonCode: 'terminal_renderer_not_ready' };
        // macOS (live iMac report 2026-08-07): `child` here is the osascript process whose
        // AppleScript CLOSES the Terminal.app window only AFTER the popup process exits.
        // Returning immediately made the `finally` kill it first, so the window stayed open
        // showing "[Process completed]" over a stale frame. Give the AppleScript a bounded
        // window (~8s of polls) to close the Terminal window and exit on its own; the kill in
        // `finally` then hits an already-dead process. Linux/Windows terminal windows close
        // themselves when their command exits — their flow is unchanged (no extra waiting).
        if (input.capability.method === 'mac_terminal') {
          for (let pollCount = 0; pollCount < 40 && !childExited; pollCount += 1) {
            await dependencies.sleep(200);
          }
        }
        return { state: 'completed', output };
      }
      if (terminalExitNonZero) return { state: 'launch_failed', reasonCode: 'terminal_exit_nonzero' };
      await dependencies.sleep(PROMPT_ENHANCEMENT_POPUP_HOST_POLL_INTERVAL_MS_V1);
    }
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* best-effort timeout/cleanup termination */ }
    }
    try { dependencies.cleanupTempDir(tempDir); } catch { /* cleanup must not crash the hook */ }
  }
}

// ── MPS Phase 2 (Option D) — the CONTINUATION (2nd popup) window launcher ─────────────────────────
export type PromptEnhancementCliMpsContinuationHostLaunchResultV1 =
  | { state: 'not_applicable'; reasonCode: 'direct_tty' }
  | { state: 'host_unavailable'; reasonCode: 'unsupported_platform' | 'no_gui_session' | 'no_supported_terminal' }
  | { state: 'launch_failed'; reasonCode: 'terminal_spawn_failed' | 'terminal_exit_nonzero' | 'terminal_renderer_not_ready' }
  // Blink fix: the launcher rejects a continuation here instead of spawning a window the child would open
  // then close. Callers treat it exactly like any non-`completed` result — the reasonCode flows into the
  // existing continuation not-shown mapping. Two reasons:
  //  - `payload_invalid_pre_spawn`  : structurally broken (a field the child dereferences is absent).
  //  - `render_decision_no_popup`   : structurally present, but the SAME render decision the child's runner
  //                                   makes resolves to non-`ready` (`no_popup`) — the child would render
  //                                   nothing, so no window is opened.
  | { state: 'not_shown'; reasonCode: 'payload_invalid_pre_spawn' | 'render_decision_no_popup'; validationReasonCodes: readonly string[] }
  | { state: 'completed'; output: PromptEnhancementMpsContinuationHostOutputV1 };

export interface PromptEnhancementCliMpsContinuationHostLaunchDependenciesV1 {
  makeTempDir: () => string;
  writeContinuationInputFile: (path: string, input: PromptEnhancementMpsContinuationHostInputV1) => void;
  spawnTerminal: (plan: PromptEnhancementLinuxTerminalLaunchPlanV1) => Promise<PromptEnhancementSpawnedTerminalV1>;
  readContinuationResultFile: (path: string) => PromptEnhancementMpsContinuationHostOutputV1 | undefined;
  readReadyFile: (path: string) => boolean;
  sleep: (milliseconds: number) => Promise<void>;
  cleanupTempDir: (path: string) => void;
  detectPopupGeometry: () => Promise<PopupGeometry | undefined>;
}

function defaultContinuationLaunchDependencies(): PromptEnhancementCliMpsContinuationHostLaunchDependenciesV1 {
  return {
    makeTempDir,
    writeContinuationInputFile,
    spawnTerminal,
    readContinuationResultFile,
    readReadyFile,
    sleep,
    cleanupTempDir,
    detectPopupGeometry: defaultLaunchDependencies().detectPopupGeometry,
  };
}

/**
 * Launch the CONTINUATION (2nd) popup in a spawned window. A faithful sibling of
 * runPromptEnhancementCliPopupHostLaunchV1: it uses the SAME hidden child command and the SAME
 * per-platform plan builders (Windows / macOS / Linux), so cross-platform spawn behaviour is IDENTICAL
 * — the only differences are the continuation input it writes and the continuation outcome it reads
 * back. The working first-popup launcher is left untouched (locked "preserve the Linux path" rule).
 * Phase 3 wires this into the Stop-hook continuation launcher.
 */
export async function runPromptEnhancementCliMpsContinuationHostLaunchV1(input: {
  capability: PromptEnhancementCliHostCapabilityV1;
  continuation: Pick<PromptEnhancementSequencePackagedContinuationV1, 'result' | 'handoffMetadata' | 'event' | 'progress' | 'itemKind'>;
  cliEntryPath: string;
  dbPath: string;
  nodePath?: string;
}, overrides: Partial<PromptEnhancementCliMpsContinuationHostLaunchDependenciesV1> = {}): Promise<PromptEnhancementCliMpsContinuationHostLaunchResultV1> {
  if (input.capability.state === 'unavailable') {
    return { state: 'host_unavailable', reasonCode: input.capability.reasonCode };
  }
  if (input.capability.method === 'direct_tty') return { state: 'not_applicable', reasonCode: 'direct_tty' };

  // Pre-spawn structural gate (blink fix, Phase 2 — NARROWED): the continuation child marks itself ready
  // BEFORE it validates, so a structurally-broken continuation still opens a window that then closes (a
  // "blink"). Mirror the child's `asContinuationInput` structural check — the five fields it dereferences
  // (result / handoffMetadata / event / progress / itemKind) — BEFORE spawning, so a broken payload never
  // opens a window. Deliberately NOT the full validatePromptEnhancementPrepareResultV1 on the raw body: a
  // CONFIRMATION item carries an empty original slice and the runner validates WITH the
  // `originalPromptText ← text` substitution — a raw check here would wrongly reject every valid
  // confirmation continuation. This is presence-only; the runner stays the single content validator, so a
  // valid confirmation item (all five fields present) still spawns and renders exactly as before.
  const c = input.continuation as Record<string, unknown> | null | undefined;
  const missing: string[] = [];
  if (!c || typeof c !== 'object') {
    missing.push('missing_continuation');
  } else {
    if (c.result == null) missing.push('missing_result');
    if (c.handoffMetadata == null) missing.push('missing_handoff_metadata');
    if (c.event == null) missing.push('missing_event');
    if (c.progress == null) missing.push('missing_progress');
    if (typeof c.itemKind !== 'string' || c.itemKind.length === 0) missing.push('missing_item_kind');
  }
  if (missing.length > 0) {
    return { state: 'not_shown', reasonCode: 'payload_invalid_pre_spawn', validationReasonCodes: missing };
  }

  // Display-decision pre-spawn gate (blink fix): the continuation child marks itself ready BEFORE it
  // renders, so a non-displayable continuation does not surface as `terminal_renderer_not_ready` — but the
  // window still visually opens then closes (a blink). Run the SAME render decision the child's runner runs
  // (`buildPromptEnhancementMpsContinuationPopupV1` with the runner's fixed `additionalDetails` / `cancel`
  // inputs — see cli-mps-continuation-run.ts) BEFORE spawning. That function applies the kind-aware
  // confirmation substitution internally, so a valid CONFIRMATION item (empty original slice) is NOT
  // wrongly rejected — this is deliberately not a raw validation. If it would not render (non-`ready`),
  // open no window. A throw means the child (which wraps the same build) would resolve to not-shown too,
  // so it is treated the same — never a spawned window.
  try {
    const continuationRender = buildPromptEnhancementMpsContinuationPopupV1({
      result: input.continuation.result,
      handoffMetadata: input.continuation.handoffMetadata,
      event: input.continuation.event,
      progress: input.continuation.progress,
      itemKind: input.continuation.itemKind,
      additionalDetails: { text: '', revision: 0 },
      cancel: { state: 'available', disposition: 'blocked_no_send' },
    });
    if (continuationRender.state !== 'ready') {
      return { state: 'not_shown', reasonCode: 'render_decision_no_popup', validationReasonCodes: continuationRender.reasonCodes };
    }
  } catch {
    return { state: 'not_shown', reasonCode: 'render_decision_no_popup', validationReasonCodes: ['continuation_render_threw'] };
  }

  const dependencies = { ...defaultContinuationLaunchDependencies(), ...overrides };
  const tempDir = dependencies.makeTempDir();
  const inputFile = join(tempDir, 'input.json');
  const resultFile = join(tempDir, 'result.json');
  const readinessFile = join(tempDir, 'ready');
  let child: PromptEnhancementSpawnedTerminalV1 | undefined;
  let terminalExitNonZero = false;
  let rendererReady = false;

  try {
    const childInput: PromptEnhancementMpsContinuationHostInputV1 = {
      protocolVersion: PROMPT_ENHANCEMENT_POPUP_HOST_PROTOCOL_VERSION_V1,
      continuation: {
        result: input.continuation.result,
        handoffMetadata: input.continuation.handoffMetadata,
        event: input.continuation.event,
        progress: input.continuation.progress,
        itemKind: input.continuation.itemKind,
      },
    };
    dependencies.writeContinuationInputFile(inputFile, childInput);
    const geometry = await dependencies.detectPopupGeometry();
    let plan: PromptEnhancementLinuxTerminalLaunchPlanV1;
    if (input.capability.method === 'windows_terminal') {
      const launcherScriptPath = join(tempDir, 'launch.cmd');
      let positionScriptPath: string | undefined;
      if (geometry) {
        positionScriptPath = join(tempDir, 'position.ps1');
        writeFileSync(positionScriptPath, buildPromptEnhancementWindowsPositionScriptV1(geometry), 'utf8');
      }
      const launcherScript = buildPromptEnhancementWindowsLauncherScriptV1({
        nodeExecPath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
        geometry,
        positionScriptPath,
      });
      writeFileSync(launcherScriptPath, launcherScript, 'utf8');
      if (process.env.NEXPATH_DEBUG) process.stderr.write(`[nexpath] mps-continuation launch.cmd (${launcherScriptPath}):\n${launcherScript}\n`);
      plan = planPromptEnhancementWindowsTerminalLaunchV1({ launcherScriptPath });
    } else if (input.capability.method === 'mac_terminal') {
      const launcherScriptPath = join(tempDir, 'launch.sh');
      writeFileSync(launcherScriptPath, buildPromptEnhancementMacLauncherScriptV1({
        nodeExecPath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
      }), { mode: 0o700 });
      plan = planPromptEnhancementMacTerminalLaunchV1({ launcherScriptPath, geometry });
    } else {
      plan = planPromptEnhancementLinuxTerminalLaunchV1({
        terminalCommand: input.capability.terminalCommand,
        nodePath: input.nodePath ?? process.execPath,
        cliEntryPath: input.cliEntryPath,
        geometry,
        displayServer: detectPromptEnhancementLinuxDisplayServerV1(),
        inputFile,
        resultFile,
        readinessFile,
        dbPath: input.dbPath,
      });
    }
    if (process.env.NEXPATH_DEBUG) {
      process.stderr.write(`[nexpath] MPS continuation popup spawn: ${plan.command} ${JSON.stringify(plan.args)}\n`);
    }
    let childExited = false;
    try {
      child = await dependencies.spawnTerminal(plan);
      child.once('exit', (code, signal) => {
        childExited = true;
        terminalExitNonZero = code !== 0 || signal !== null;
      });
    } catch {
      return { state: 'launch_failed', reasonCode: 'terminal_spawn_failed' };
    }

    for (;;) {
      rendererReady ||= dependencies.readReadyFile(readinessFile);
      const output = dependencies.readContinuationResultFile(resultFile);
      if (output) {
        if (!rendererReady) return { state: 'launch_failed', reasonCode: 'terminal_renderer_not_ready' };
        if (input.capability.method === 'mac_terminal') {
          for (let pollCount = 0; pollCount < 40 && !childExited; pollCount += 1) {
            await dependencies.sleep(200);
          }
        }
        return { state: 'completed', output };
      }
      if (terminalExitNonZero) return { state: 'launch_failed', reasonCode: 'terminal_exit_nonzero' };
      await dependencies.sleep(PROMPT_ENHANCEMENT_POPUP_HOST_POLL_INTERVAL_MS_V1);
    }
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* best-effort timeout/cleanup termination */ }
    }
    try { dependencies.cleanupTempDir(tempDir); } catch { /* cleanup must not crash the hook */ }
  }
}
