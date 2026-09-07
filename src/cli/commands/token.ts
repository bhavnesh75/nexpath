import { password, confirm, isCancel } from '@clack/prompts';
import {
  storeNexpathToken,
  removeNexpathToken,
  readNexpathToken,
  isValidNexpathToken,
} from '../../config/NexpathTokenStore.js';

// Mirrors config.ts's API-key command shape exactly.

export type TokenPasswordFn = () => Promise<string | null>;
export type TokenConfirmFn  = () => Promise<boolean>;

const defaultTokenPasswordFn: TokenPasswordFn = async () => {
  const input = await password({
    message:  'Nexpath token:',
    validate: (value) => {
      if (!isValidNexpathToken(value)) return 'Invalid Nexpath token format (expected npk_...)';
      return undefined;
    },
  });
  if (isCancel(input)) return null;
  return String(input);
};

const defaultRotateConfirmFn: TokenConfirmFn = async () => {
  const answer = await confirm({
    message:      'Overwrite the existing Nexpath token?',
    initialValue: false,
  });
  return !isCancel(answer) && answer === true;
};

export interface ConfigTokenOpts {
  projectRoot?: string;
  passwordFn?:  TokenPasswordFn;
  confirmFn?:   TokenConfirmFn;
  output?:      (line: string) => void;
}

const defaultPrint = (line: string): void => { console.log(line); };

// The Mode-B disclosure line was REMOVED on 2026-09-01 (product decision: no
// storage/data-flow statements shown to users for now; revisit at a future
// privacy pass).

export async function configSetTokenAction(opts: ConfigTokenOpts = {}): Promise<void> {
  const print      = opts.output     ?? defaultPrint;
  const passwordFn = opts.passwordFn ?? defaultTokenPasswordFn;

  const token = await passwordFn();
  if (token === null || token === '') {
    print('Cancelled — no Nexpath token stored.');
    return;
  }

  const result = await storeNexpathToken(token);
  print(`✓ Nexpath token stored in ${result.source}`);
}

export async function configRotateTokenAction(opts: ConfigTokenOpts = {}): Promise<void> {
  const print      = opts.output     ?? defaultPrint;
  const passwordFn = opts.passwordFn ?? defaultTokenPasswordFn;
  const confirmFn  = opts.confirmFn  ?? defaultRotateConfirmFn;

  // ⚠️ Read the token directly rather than asking `getKeySource`, for the reason
  // `configRemoveTokenAction` does below: a stored token can be shadowed by a
  // higher-priority OpenAI key, and `getKeySource` would then report that layer
  // — so a rotate would refuse a token that is genuinely there.
  const existing = await readNexpathToken();
  if (existing === null) {
    print('Error: No existing Nexpath token to rotate. Use `nexpath config set-token` to store one first.');
    process.exitCode = 1;
    return;
  }

  print('A Nexpath token is currently stored.');
  const ok = await confirmFn();
  if (!ok) {
    print('Cancelled — existing Nexpath token retained.');
    return;
  }

  const token = await passwordFn();
  if (token === null || token === '') {
    print('Cancelled — existing Nexpath token retained.');
    return;
  }

  const result = await storeNexpathToken(token);
  print(`✓ Nexpath token rotated; new token stored in ${result.source}`);
}

export async function configRemoveTokenAction(opts: ConfigTokenOpts = {}): Promise<void> {
  const print = opts.output ?? defaultPrint;

  // ⚠️ Checked directly via readNexpathToken(), not getKeySource(): a token can
  // be stored while shadowed by a higher-priority OpenAI key (env/dotenv/
  // keychain/file), in which case getKeySource() would report that layer
  // instead and this message would wrongly say "nothing was stored".
  const hadToken = (await readNexpathToken()) !== null;
  await removeNexpathToken();
  if (hadToken) {
    print('✓ Nexpath token removed.');
  } else {
    print('No Nexpath token was stored.');
  }
}
