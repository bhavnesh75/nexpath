import pc from 'picocolors';

/**
 * Copy for the install-time credential choice — the one place its wording lives,
 * mirroring `role-description.ts`'s shape so the two prompts read the same way.
 *
 * Nexpath needs exactly one credential and accepts two kinds. The OpenAI key is
 * listed first and is the default because it is what every existing install
 * already uses; the token is the alternative for someone who does not want an
 * OpenAI account. There is deliberately no third "skip" option — a credential
 * was required before and still is.
 */

/**
 * The two options, in display order. The first is the default selection.
 *
 * ⚠️ Each option carries its OWN detail lines, and the picker renders them
 * directly under it. They used to live in one block below both options, which
 * meant the reader picked from two bare labels and then had to match each one
 * against a heading repeated further down — the detail was on screen but not
 * where the decision was being made. Keeping the copy on the option is also
 * what stops the two lists drifting: there is no second place to update.
 */
export const CREDENTIAL_OPTIONS = [
  {
    value: 'openai_key',
    label: 'OpenAI API key',
    detail: [
      'Use your own OpenAI account.',
      'https://platform.openai.com/api-keys',
    ],
  },
  {
    value: 'nexpath_token',
    label: 'Nexpath token',
    detail: [
      'No OpenAI account needed. Free $1.00 credit, no expiry.',
      'https://parseos.tech/nexpath/signup',
    ],
  },
] as const;

export type CredentialChoice = (typeof CREDENTIAL_OPTIONS)[number]['value'];

/** Heading shown above the two options. */
export const CREDENTIAL_PROMPT_TITLE = 'Choose how Nexpath runs';

/**
 * The whole choice block: every option with its detail lines indented beneath
 * it. One function so the picker cannot render the options and the copy out of
 * step.
 *
 * ⚠️ There is deliberately no closing line about precedence here. It used to
 * say "If both are set, your OpenAI key is always used" — true, and still true,
 * but it answers a question almost nobody has at this point: the reader is
 * picking ONE credential, and being told what happens when they have two is
 * noise in front of a decision. The rule still gets stated where it actually
 * applies — {@link CREDENTIAL_KEY_WINS_NOTICE}, shown only when someone chooses
 * the token while a key is already stored, which is the one moment it changes
 * what they should expect.
 *
 * `selectedIndex` marks the row the cursor is on — filled bullet and a bright
 * label, against dimmed bullets and labels for the rest. Detail lines stay gray
 * for every option, selected or not: they are what the reader compares to make
 * the choice, so dimming the unselected one's copy would hide exactly the half
 * they have not decided about yet.
 *
 * `colors` is injectable so a spawned window can force ANSI output regardless of
 * the parent process's colour detection — same seam as the role block.
 */
export function buildCredentialOptionLines(
  selectedIndex: number,
  colors: ReturnType<typeof pc.createColors> = pc,
): string[] {
  const bar = colors.cyan('│');
  const lines: string[] = [];

  CREDENTIAL_OPTIONS.forEach((option, index) => {
    const selected = index === selectedIndex;
    lines.push(
      selected
        ? `${bar}  ${colors.green('●')} ${option.label}`
        : `${bar}  ${colors.dim('○')} ${colors.dim(option.label)}`,
    );
    // Indented past the bullet so a detail line reads as belonging to the
    // option above it rather than as another choice.
    for (const line of option.detail) lines.push(`${bar}     ${colors.gray(line)}`);
  });

  return lines;
}

/** Where a Nexpath token comes from. Named once so the copy cannot drift. */
export const NEXPATH_SIGNUP_URL = 'https://parseos.tech/nexpath/signup';

/**
 * Shown just above the token input. Someone who picks the token has, by
 * definition, not got one yet — so the prompt has to say where it comes from,
 * or they are staring at a masked field with nowhere to go.
 *
 * ⚠️ Written as a short paragraph, not numbered steps: it is three ordinary
 * actions on one page, and numbering them makes a two-minute errand look like a
 * procedure. Wrapped by hand so it reads the same in a narrow terminal, where
 * one long line would fold at an arbitrary point.
 */
export const CREDENTIAL_TOKEN_HELP_LINES = [
  'Sign up here — it is free:',
  `  ${NEXPATH_SIGNUP_URL}`,
  'Your token is shown on your account page once you are',
  'in. Copy it from there and paste it below.',
] as const;

/**
 * The help block as the picker's own frame draws it — gutter-framed, with a
 * blank gutter line above and below so it sits as one paragraph between the
 * chosen option and the input field.
 *
 * ⚠️ Framed rather than printed bare. These lines land between two clack
 * widgets — the submitted choice above, the token field below — and an
 * unframed `console.log` breaks the vertical rule running down the whole
 * install, leaving the paragraph looking like output that escaped from
 * somewhere else rather than part of the question being asked.
 *
 * ⚠️ Left uncoloured on purpose. The option details in the picker are gray
 * because they are being skimmed and compared; this is the one thing the user
 * must actually read and act on before they can continue.
 */
export function buildCredentialTokenHelpLines(
  colors: ReturnType<typeof pc.createColors> = pc,
): string[] {
  const bar = colors.cyan('│');
  return [bar, ...CREDENTIAL_TOKEN_HELP_LINES.map((line) => `${bar}  ${line}`), bar];
}

/**
 * Prompt message for the credential's own input.
 *
 * ⚠️ The token half is deliberately bare. It used to carry the key half's
 * parenthetical — "(Enter to keep existing token stored in Credential Manager)"
 * — which is a long aside about a keystroke, in front of a field where most
 * people are pasting something for the first time. The token's own explanation
 * is {@link CREDENTIAL_TOKEN_HELP_LINES}, printed above the field, so the field
 * itself stays a field.
 *
 * The OpenAI key half is untouched: it is the flow every existing install
 * already knows, and this milestone does not change it.
 */
export function credentialInputMessage(
  choice: CredentialChoice,
  keychainName: string,
  hasStored: boolean,
): string {
  if (choice === 'nexpath_token') return 'Paste token here:';
  return hasStored
    ? `API Key (Enter to keep existing key stored in ${keychainName}):`
    : `API Key (will be stored in ${keychainName}):`;
}

/**
 * Shown when the token is chosen while an OpenAI key is already stored. The
 * resolver's order is not a preference the install can override, so saying so
 * once here is the difference between a surprising outcome and an expected one.
 */
export const CREDENTIAL_KEY_WINS_NOTICE =
  'Your OpenAI key is already stored and will be used instead of this token.';
