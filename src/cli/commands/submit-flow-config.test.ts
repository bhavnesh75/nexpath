import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isSubmitAdvisoryEnabledForHost,
  setSubmitFlowFlag,
  SUBMIT_ADVISORY_ENV,
  SUBMIT_FLOW_FLAG_FILENAME,
  submitFlowFlagPath,
} from './submit-flow-config.js';

describe('submit-flow-config — the config-backed switch resolver', () => {
  const flag = (obj: unknown) => () => JSON.stringify(obj);
  const noFlag = () => null;

  it('env "1" forces ON (developer override wins over an absent/false flag)', () => {
    expect(isSubmitAdvisoryEnabledForHost('cursor', {
      env: { [SUBMIT_ADVISORY_ENV.cursor]: '1' }, readFlagFile: flag({ cursor: false }),
    })).toBe(true);
  });

  it('env "0" forces OFF (override wins over a true flag)', () => {
    expect(isSubmitAdvisoryEnabledForHost('windsurf', {
      env: { [SUBMIT_ADVISORY_ENV.windsurf]: '0' }, readFlagFile: flag({ windsurf: true }),
    })).toBe(false);
  });

  it('⭐ no env → the shipped flag decides (true)', () => {
    expect(isSubmitAdvisoryEnabledForHost('cursor', { env: {}, readFlagFile: flag({ cursor: true }) })).toBe(true);
  });

  it('no env, flag false → OFF', () => {
    expect(isSubmitAdvisoryEnabledForHost('cursor', { env: {}, readFlagFile: flag({ cursor: false }) })).toBe(false);
  });

  it('no env, flag absent → OFF (old flow, safe default)', () => {
    expect(isSubmitAdvisoryEnabledForHost('windsurf', { env: {}, readFlagFile: noFlag })).toBe(false);
  });

  it('per-host isolation: cursor flag true does not enable windsurf', () => {
    expect(isSubmitAdvisoryEnabledForHost('windsurf', { env: {}, readFlagFile: flag({ cursor: true }) })).toBe(false);
  });

  it('garbage flag file → OFF, never throws', () => {
    expect(isSubmitAdvisoryEnabledForHost('cursor', { env: {}, readFlagFile: () => '{not json' })).toBe(false);
  });

  it('env values other than "1"/"0" ignore the override and fall to the flag', () => {
    expect(isSubmitAdvisoryEnabledForHost('cursor', {
      env: { [SUBMIT_ADVISORY_ENV.cursor]: 'true' }, readFlagFile: flag({ cursor: true }),
    })).toBe(true);
  });

  it('setSubmitFlowFlag merges — enabling cursor preserves windsurf', () => {
    let written = '';
    setSubmitFlowFlag('cursor', true, {
      readFlagFile: () => JSON.stringify({ windsurf: true }),
      writeFlagFile: (_p, t) => { written = t; },
    });
    const parsed = JSON.parse(written);
    expect(parsed).toEqual({ windsurf: true, cursor: true });
  });

  it('setSubmitFlowFlag on an absent file creates it', () => {
    let written = '';
    setSubmitFlowFlag('windsurf', true, { readFlagFile: () => null, writeFlagFile: (_p, t) => { written = t; } });
    expect(JSON.parse(written)).toEqual({ windsurf: true });
  });

  it('pins the filename + env-var names + path shape (cross-package contract with the extension)', () => {
    expect(SUBMIT_FLOW_FLAG_FILENAME).toBe('submit-flow.json');
    expect(SUBMIT_ADVISORY_ENV.cursor).toBe('NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY');
    expect(SUBMIT_ADVISORY_ENV.windsurf).toBe('NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY');
    expect(submitFlowFlagPath('/home/u/.nexpath')).toBe(join('/home/u/.nexpath', 'submit-flow.json')); // host separator
  });
});
