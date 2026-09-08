/**
 * RC78 — the popup supervisor: protocol, claim race, self-delivery of the original.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeLateCancelDeadlineMs,
  LATE_CANCEL_ENV,
  LATE_CANCEL_DEADLINE_LINUX_MS,
  LATE_CANCEL_DEADLINE_DEFAULT_MS,
  popupSupervisionPaths,
  popupSupervisionRoot,
  writePopupSupervisionStatus,
  readPopupSupervisionStatus,
  claimPopupTurn,
  prunePopupSupervision,
  spawnPopupSupervisor,
  runPopupSupervisor,
  persistOriginalResend,
  submitPopupSuperviseAction,
  buildSupervisedPromptSubmitDecider,
  SUBMIT_POPUP_SUPERVISE_COMMAND,
  SUBMIT_POPUP_START_GRACE_MS,
  SUBMIT_POPUP_STALE_TURN_MS,
  SUBMIT_POPUP_LOST_CLAIM_WAIT_MS,
  type PopupSupervisionStatus,
} from './submit-popup-supervisor.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'nexpath-rc78-')); }

describe('computeLateCancelDeadlineMs — when the hook stops trusting the host', () => {
  it('linux keeps a long transparent hold (under the 205 s measured on this build)', () => {
    expect(computeLateCancelDeadlineMs({ platform: 'linux', env: {} })).toBe(LATE_CANCEL_DEADLINE_LINUX_MS);
  });
  it('win32 and darwin are unmeasured hosts: 45 s, under every host\'s 60 s convention', () => {
    expect(computeLateCancelDeadlineMs({ platform: 'win32', env: {} })).toBe(LATE_CANCEL_DEADLINE_DEFAULT_MS);
    expect(computeLateCancelDeadlineMs({ platform: 'darwin', env: {} })).toBe(LATE_CANCEL_DEADLINE_DEFAULT_MS);
  });
  it('a positive integer in the env overrides; junk and non-positive values are ignored', () => {
    expect(computeLateCancelDeadlineMs({ platform: 'win32', env: { [LATE_CANCEL_ENV]: '120000' } })).toBe(120_000);
    expect(computeLateCancelDeadlineMs({ platform: 'win32', env: { [LATE_CANCEL_ENV]: '0' } })).toBe(LATE_CANCEL_DEADLINE_DEFAULT_MS);
    expect(computeLateCancelDeadlineMs({ platform: 'win32', env: { [LATE_CANCEL_ENV]: 'soon' } })).toBe(LATE_CANCEL_DEADLINE_DEFAULT_MS);
  });
});

describe('status file + claim — the protocol primitives', () => {
  it('round-trips both states and rejects junk', () => {
    const root = tmp();
    const p = popupSupervisionPaths(root, 'turn/1 x');
    expect(p.dir.startsWith(popupSupervisionRoot(root))).toBe(true);
    expect(p.dir.endsWith('turn_1_x')).toBe(true); // fs-safe
    mkdirSync(p.dir, { recursive: true });
    const running: PopupSupervisionStatus = { schemaVersion: 1, state: 'running', startedAt: 5, pid: 7 };
    writePopupSupervisionStatus(p.statusFile, running);
    expect(readPopupSupervisionStatus(p.statusFile)).toEqual(running);
    const done: PopupSupervisionStatus = { ...running, state: 'done', finishedAt: 9, decision: 'block', selfDelivered: 'none', afterCancel: false };
    writePopupSupervisionStatus(p.statusFile, done);
    expect(readPopupSupervisionStatus(p.statusFile)).toEqual(done);
    expect(existsSync(`${p.statusFile}.tmp`)).toBe(false); // atomic rename, no leftovers
    writeFileSync(p.statusFile, '{not json');
    expect(readPopupSupervisionStatus(p.statusFile)).toBeNull();
    writeFileSync(p.statusFile, JSON.stringify({ schemaVersion: 2, state: 'done', decision: 'block' }));
    expect(readPopupSupervisionStatus(p.statusFile)).toBeNull();
    expect(readPopupSupervisionStatus(join(root, 'missing'))).toBeNull();
  });

  it('exactly one claimant wins; a missing parent is an error, never a win', () => {
    const root = tmp();
    const p = popupSupervisionPaths(root, 't');
    mkdirSync(p.dir, { recursive: true });
    expect(claimPopupTurn(p.claimDir)).toBe('won');
    expect(claimPopupTurn(p.claimDir)).toBe('lost');
    expect(claimPopupTurn(join(root, 'nowhere', 'claim'))).toBe('error');
  });

  it('prunes only turn directories older than the stale window', () => {
    const root = tmp();
    const old = popupSupervisionPaths(root, 'old').dir;
    const fresh = popupSupervisionPaths(root, 'fresh').dir;
    mkdirSync(old, { recursive: true }); mkdirSync(fresh, { recursive: true });
    const past = (Date.now() - SUBMIT_POPUP_STALE_TURN_MS - 60_000) / 1000;
    utimesSync(old, past, past);
    expect(prunePopupSupervision(root)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(prunePopupSupervision(join(root, 'no-such-project'))).toBe(0); // no directory: silent
  });
});

describe('spawnPopupSupervisor — the detached child', () => {
  it('writes the prompt to the turn directory (never argv) and spawns detached + unref\'d with the hook\'s pids', () => {
    const root = tmp();
    const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
    const unref = vi.fn();
    const spawnFn = ((cmd: string, args: string[], opts: Record<string, unknown>) => {
      calls.push({ cmd, args, opts });
      return { pid: 4242, on: () => {}, unref } as never;
    }) as never;
    const r = spawnPopupSupervisor({
      projectRoot: root, host: 'windsurf', turnId: 't1', turnStartedAt: 1000.6, promptText: 'the user prompt',
      hookPid: 11, hookShellPid: 22, spawnFn, binaryPath: '/bin/nexpath',
    });
    expect(r.spawned).toBe(true);
    expect(r.pid).toBe(4242);
    expect(readFileSync(r.paths.promptFile, 'utf8')).toBe('the user prompt');
    if (process.platform !== 'win32') expect(statSync(r.paths.promptFile).mode & 0o777).toBe(0o600);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('/bin/nexpath');
    expect(calls[0]!.args).toEqual([
      SUBMIT_POPUP_SUPERVISE_COMMAND, '--project', root, '--host', 'windsurf', '--turn', 't1',
      '--turn-started-at', '1001', '--hook-pid', '11', '--hook-shell-pid', '22',
    ]);
    expect(calls[0]!.args.join(' ')).not.toContain('the user prompt');
    expect(calls[0]!.opts).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true });
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('omits --hook-shell-pid when there is no wrapper (POSIX)', () => {
    const root = tmp();
    let args: string[] = [];
    const spawnFn = ((_c: string, a: string[]) => { args = a; return { pid: 1, on: () => {}, unref: () => {} } as never; }) as never;
    spawnPopupSupervisor({ projectRoot: root, host: 'windsurf', turnId: 't', turnStartedAt: 1, promptText: 'p', hookPid: 5, spawnFn, binaryPath: 'x' });
    expect(args).not.toContain('--hook-shell-pid');
  });

  it('a spawn that throws is reported, not thrown', () => {
    const root = tmp();
    const spawnFn = (() => { throw new Error('ENOENT'); }) as never;
    const r = spawnPopupSupervisor({ projectRoot: root, host: 'windsurf', turnId: 't', turnStartedAt: 1, promptText: 'p', hookPid: 5, spawnFn, binaryPath: 'x' });
    expect(r.spawned).toBe(false);
    expect(r.error).toContain('ENOENT');
  });
});

function prepared(root: string, turn: string, prompt = 'my ORIGINAL prompt') {
  const p = popupSupervisionPaths(root, turn);
  mkdirSync(p.dir, { recursive: true });
  writeFileSync(p.promptFile, prompt);
  return p;
}

describe('runPopupSupervisor — FAST path (the hook is alive and reads the status)', () => {
  it('allow: status done/allow, claim won, nothing written, prompt file gone, directory kept for the hook', async () => {
    const root = tmp(); const p = prepared(root, 't');
    const writeDecision = vi.fn(async () => {});
    const logs: string[] = [];
    const code = await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'allow', writeDecision, appendEcho: vi.fn(), logEvent: (_l, n) => { logs.push(n); } },
    );
    expect(code).toBe(0);
    const s = readPopupSupervisionStatus(p.statusFile);
    expect(s).toMatchObject({ state: 'done', decision: 'allow', selfDelivered: 'none', afterCancel: false });
    expect(existsSync(p.claimDir)).toBe(true);   // the supervisor claimed — the hook will lose and take the status
    expect(existsSync(p.promptFile)).toBe(false); // the user's text does not linger
    expect(existsSync(p.dir)).toBe(true);         // the hook removes it after reading
    expect(writeDecision).not.toHaveBeenCalled();
    expect(logs).toContain('submit_popup_supervisor_started');
    expect(logs).toContain('submit_popup_supervisor_done');
  });

  it('block: status done/block; the record is the decider\'s business (already written with the hook\'s pids)', async () => {
    const root = tmp(); const p = prepared(root, 't');
    const writeDecision = vi.fn(async () => {});
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'block', writeDecision, appendEcho: vi.fn() },
    );
    expect(readPopupSupervisionStatus(p.statusFile)).toMatchObject({ state: 'done', decision: 'block', afterCancel: false });
    expect(writeDecision).not.toHaveBeenCalled();
  });

  it('hands the decider the real prompt and the RC76 turn boundary', async () => {
    const root = tmp(); prepared(root, 't', 'exact prompt text');
    const seen: unknown[] = [];
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 4321, hookPid: 9 },
      { decide: async (e, o, p) => { seen.push([e, o, p]); return 'allow'; }, writeDecision: vi.fn(async () => {}), appendEcho: vi.fn() },
    );
    expect(seen).toEqual([['pre_user_prompt', { project: root, turnStartedAt: 4321 }, 'exact prompt text']]);
  });
});

describe('runPopupSupervisor — LATE path (the hook already cancelled the original)', () => {
  it('"keep original" / dismiss ⇒ the ORIGINAL text becomes the decision, is registered as an echo, directory removed', async () => {
    const root = tmp(); const p = prepared(root, 't', 'the original words');
    mkdirSync(p.claimDir); // the hook claimed at its deadline
    const writeDecision = vi.fn(async () => {});
    const appendEcho = vi.fn();
    const logs: Array<[string, unknown]> = [];
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9, hookShellPid: 10 },
      { decide: async () => 'allow', writeDecision, appendEcho, openStoreFn: async () => { throw new Error('no store in test'); }, logEvent: (_l, n, d) => { logs.push([n, d]); }, keepDir: true },
    );
    expect(writeDecision).toHaveBeenCalledTimes(1);
    const rec = (writeDecision.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(rec).toMatchObject({ projectRoot: root, host: 'windsurf', replacementText: 'the original words', hookPid: 9, hookShellPid: 10 });
    expect(String(rec.decisionId)).toMatch(/^so-/);
    expect(appendEcho).toHaveBeenCalledWith(root, 'the original words');
    expect(readPopupSupervisionStatus(p.statusFile)).toMatchObject({ state: 'done', decision: 'allow', selfDelivered: 'original', afterCancel: true });
    const done = logs.find(([n]) => n === 'submit_popup_supervisor_done');
    expect(done?.[1]).toMatchObject({ decision: 'allow', after_cancel: true, self_delivered: 'original', claim: 'lost' });
  });

  it('removes the turn directory when it is the last one alive', async () => {
    const root = tmp(); const p = prepared(root, 't');
    mkdirSync(p.claimDir);
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'allow', writeDecision: vi.fn(async () => {}), appendEcho: vi.fn(), openStoreFn: async () => { throw new Error('x'); } },
    );
    expect(existsSync(p.dir)).toBe(false);
  });

  it('"use enhanced" ⇒ nothing extra: the decider already persisted the enhanced record', async () => {
    const root = tmp(); const p = prepared(root, 't');
    mkdirSync(p.claimDir);
    const writeDecision = vi.fn(async () => {});
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'block', writeDecision, appendEcho: vi.fn(), keepDir: true },
    );
    expect(writeDecision).not.toHaveBeenCalled();
    expect(readPopupSupervisionStatus(p.statusFile)).toMatchObject({ state: 'done', decision: 'block', selfDelivered: 'none', afterCancel: true });
  });

  it('a decider that THROWS after the cancel still re-sends the original — the prompt is never lost', async () => {
    const root = tmp(); const p = prepared(root, 't', 'keep me');
    mkdirSync(p.claimDir);
    const writeDecision = vi.fn(async () => {});
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => { throw new Error('stop crashed'); }, writeDecision, appendEcho: vi.fn(), openStoreFn: async () => { throw new Error('x'); }, keepDir: true },
    );
    expect(writeDecision).toHaveBeenCalledTimes(1);
    expect((writeDecision.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ replacementText: 'keep me' });
  });

  it('a failed re-send is logged, never thrown; the status says nothing was delivered', async () => {
    const root = tmp(); const p = prepared(root, 't');
    mkdirSync(p.claimDir);
    const logs: string[] = [];
    await expect(runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'allow', writeDecision: async () => { throw new Error('disk full'); }, appendEcho: vi.fn(), logEvent: (_l, n) => { logs.push(n); }, keepDir: true },
    )).resolves.toBe(0);
    expect(logs).toContain('submit_popup_supervisor_resend_failed');
    expect(readPopupSupervisionStatus(p.statusFile)).toMatchObject({ selfDelivered: 'none', afterCancel: true });
  });

  it('an unreadable prompt after a cancel re-sends nothing and says so', async () => {
    const root = tmp(); const p = popupSupervisionPaths(root, 't');
    mkdirSync(p.dir, { recursive: true }); mkdirSync(p.claimDir); // no prompt file
    const writeDecision = vi.fn(async () => {});
    const logs: string[] = [];
    await runPopupSupervisor(
      { project: root, host: 'windsurf', turn: 't', turnStartedAt: 100, hookPid: 9 },
      { decide: async () => 'allow', writeDecision, appendEcho: vi.fn(), logEvent: (_l, n) => { logs.push(n); }, keepDir: true },
    );
    expect(writeDecision).not.toHaveBeenCalled();
    expect(logs).toContain('submit_popup_supervisor_prompt_unreadable');
    expect(logs).toContain('submit_popup_supervisor_no_prompt_to_resend');
  });
});

describe('persistOriginalResend', () => {
  it('writes the original as the replacement, stamps the hook\'s pids, registers the echo', async () => {
    const writeDecision = vi.fn(async () => {});
    const appendEcho = vi.fn();
    await persistOriginalResend(
      { projectRoot: '/p', host: 'windsurf', promptText: 'orig', hookPid: 3, hookShellPid: 4 },
      { writeDecision, appendEcho, now: () => 5000, openStoreFn: async () => { throw new Error('no store'); } },
    );
    expect(writeDecision).toHaveBeenCalledWith({
      projectRoot: '/p', decisionId: 'so-5000-5000', replacementText: 'orig', createdAt: 5000, blockIssuedAt: 5000,
      hookPid: 3, hookShellPid: 4, host: 'windsurf',
    });
    expect(appendEcho).toHaveBeenCalledWith('/p', 'orig');
  });
});

describe('submitPopupSuperviseAction — argv hygiene', () => {
  it('refuses to run without a usable hook pid (nothing waits on the exit code)', async () => {
    await expect(submitPopupSuperviseAction({ project: '/p', host: 'windsurf', turn: 't', turnStartedAt: '1', hookPid: 'abc' })).resolves.toBe(0);
    await expect(submitPopupSuperviseAction({ project: '', host: 'windsurf', turn: 't', turnStartedAt: '1', hookPid: '5' })).resolves.toBe(0);
  });
});

// ── The hook-side decider on a virtual clock ─────────────────────────────────

type Status = ReturnType<typeof readPopupSupervisionStatus>;
function harness(over: Partial<Parameters<typeof buildSupervisedPromptSubmitDecider>[1]> & { statuses?: () => Status } = {}) {
  let t = 1_000_000;
  const now = () => t;
  const sleep = async (ms: number) => { t += ms; };
  const logs: Array<[string, Record<string, unknown> | undefined]> = [];
  const spawnSupervisor = vi.fn(() => ({ spawned: true, pid: 77, paths: popupSupervisionPaths('/proj', 'x') }));
  const claim = vi.fn(() => 'won' as const);
  const onLateCancel = vi.fn();
  const decider = buildSupervisedPromptSubmitDecider({ project: '/proj' }, {
    host: 'windsurf', hookStartedAt: t, deadlineMs: 45_000, hookPid: 1,
    now, sleep, spawnSupervisor: spawnSupervisor as never, claim: claim as never, prune: () => 0,
    readStatus: over.statuses ?? (() => null),
    logEvent: (_l, n, d) => { logs.push([n, d as Record<string, unknown>]); },
    onLateCancel,
    ...over,
  });
  return { decider, logs, spawnSupervisor, claim, onLateCancel, now: () => t };
}
const running = (): Status => ({ schemaVersion: 1, state: 'running', startedAt: 1, pid: 77 });
const done = (decision: 'allow' | 'block'): Status => ({ schemaVersion: 1, state: 'done', startedAt: 1, pid: 77, finishedAt: 2, decision, selfDelivered: 'none', afterCancel: false });

describe('buildSupervisedPromptSubmitDecider — the hook side', () => {
  it('a blank prompt is allowed without spawning anything', async () => {
    const h = harness();
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, '   ')).resolves.toBe('allow');
    expect(h.spawnSupervisor).not.toHaveBeenCalled();
  });

  it('a failed spawn allows (A3) and logs it', async () => {
    const h = harness({ spawnSupervisor: (() => ({ spawned: false, error: 'boom', paths: popupSupervisionPaths('/proj', 'x') })) as never });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
    expect(h.logs.find(([n]) => n === 'windsurf_hook_popup_supervisor_spawned')?.[1]).toMatchObject({ spawned: false, error: 'boom' });
  });

  it('no `running` status within the start grace ⇒ allow — never cancel for a popup that is not on screen', async () => {
    const h = harness({ statuses: () => null });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
    expect(h.logs.some(([n]) => n === 'windsurf_hook_popup_supervisor_not_started')).toBe(true);
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.now() - 1_000_000).toBeGreaterThan(SUBMIT_POPUP_START_GRACE_MS);
  });

  it('FAST path: done before the deadline ⇒ that decision, no claim, no cancel', async () => {
    let polls = 0;
    const h = harness({ statuses: () => (++polls < 5 ? running() : done('block')) });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('block');
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.onLateCancel).not.toHaveBeenCalled();
    const d = h.logs.find(([n]) => n === 'windsurf_hook_popup_supervisor_done')?.[1];
    expect(d).toMatchObject({ decision: 'block', after_cancel: false });
    polls = 0;
    const h2 = harness({ statuses: () => (++polls < 3 ? running() : done('allow')) });
    await expect(h2.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
  });

  it('⭐ LATE path: still running at the deadline ⇒ claim, cancel (block), marker callback, log', async () => {
    const h = harness({ statuses: () => running() });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('block');
    expect(h.claim).toHaveBeenCalledTimes(1);
    expect(h.onLateCancel).toHaveBeenCalledTimes(1);
    const lc = h.logs.find(([n]) => n === 'windsurf_hook_late_cancel')?.[1];
    expect(lc).toMatchObject({ deadline_ms: 45_000, supervisor_pid: 77 });
    expect(lc?.elapsed_ms as number).toBeGreaterThanOrEqual(45_000);
    expect(lc?.elapsed_ms as number).toBeLessThan(45_000 + 1_000);
  });

  it('a `done` that lands in the same instant as the deadline wins over the cancel (re-read before claiming)', async () => {
    let reads = 0;
    // Every read while polling says running; the deadline re-read (the one after t >= deadline) says done.
    const h = harness({ statuses: () => (h.now() >= 1_000_000 + 45_000 && ++reads >= 2 ? done('allow') : running()) });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.onLateCancel).not.toHaveBeenCalled();
  });

  it('claim LOST at the deadline (supervisor claimed between the reads) ⇒ wait for its status and take it', async () => {
    let lost = false;
    const h = harness({
      claim: (() => { lost = true; return 'lost'; }) as never,
      statuses: () => (lost ? done('block') : running()),
    });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('block');
    expect(h.onLateCancel).not.toHaveBeenCalled();
  });

  it('claim lost but the status never lands ⇒ allow after the bounded wait', async () => {
    const h = harness({ claim: (() => 'lost') as never, statuses: () => running() });
    const t0 = h.now();
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
    expect(h.now() - t0).toBeGreaterThanOrEqual(45_000 + SUBMIT_POPUP_LOST_CLAIM_WAIT_MS);
    expect(h.logs.some(([n]) => n === 'windsurf_hook_popup_supervisor_claim_lost_no_status')).toBe(true);
  });

  it('a filesystem error on the claim never cancels a user\'s prompt', async () => {
    const h = harness({ claim: (() => 'error') as never, statuses: () => running() });
    await expect(h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 5 }, 'p')).resolves.toBe('allow');
    expect(h.onLateCancel).not.toHaveBeenCalled();
    expect(h.logs.some(([n]) => n === 'windsurf_hook_late_cancel_claim_error')).toBe(true);
  });

  it('spawns with the hook\'s pids, the RC76 boundary as the turn id, and the prompt text', async () => {
    let polls = 0;
    const h = harness({ hookPid: 321, hookShellPid: 654, statuses: () => (++polls < 2 ? running() : done('allow')) });
    await h.decider('pre_user_prompt', { project: '/proj', turnStartedAt: 999 }, 'the prompt');
    expect(h.spawnSupervisor).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: '/proj', host: 'windsurf', turnId: '999-321', turnStartedAt: 999, promptText: 'the prompt', hookPid: 321, hookShellPid: 654,
    }));
  });
});
