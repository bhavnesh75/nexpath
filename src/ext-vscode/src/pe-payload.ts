/**
 * Versioned extension-side transport envelope for a pending Prompt Enhancement
 * (P5, PEH-1). Parses the raw `PromptEnhancementPrepareResultV1` JSON — P3's
 * `pe-store-reader.ts` `resultJson` field — into a minimal, defensively-typed
 * shape this renderer needs. Never imports anything from `src/prompt-enhancement/**`.
 *
 * ARCHITECTURAL NOTE — why this doesn't call the real builder function.
 * The dev plan's original P5 design said to wrap the typed session built by
 * `buildPromptEnhancementPopupSessionV1()` (`src/prompt-enhancement/popup-session.ts`)
 * without re-declaring its fields. That is not buildable: `src/ext-vscode` is
 * its own npm package with `tsconfig.json` `rootDir: "./src"`. Verified
 * empirically — adding a throwaway TYPE-ONLY import of `popup-session.ts` and
 * running `tsc --noEmit` fails with TS6059 on `src/classifier/*`, `src/store/*`
 * (the frozen Layer C modules `popup-session.ts` transitively imports), because
 * TypeScript pulls the whole transitive graph into the program for type
 * resolution regardless of `import type` vs a value import. There is no way to
 * import from `src/prompt-enhancement/**` here, typed or not.
 *
 * So this module follows the same pattern `pe-store-reader.ts` and the
 * pre-existing `advisory-store-reader.ts` already use: a local, minimal,
 * defensively-typed interface mirroring only the JSON fields actually needed,
 * hand-parsed with `typeof`/allowed-value checks, field names matching the
 * real contract exactly (never renamed or invented) so the mapping stays
 * legible against `src/prompt-enhancement/contracts.ts`.
 *
 * Never throws — a malformed/unexpected shape returns `null` rather than
 * breaking rendering.
 */

export const PE_EXTENSION_PAYLOAD_TRANSPORT_VERSION = 1;

export type PeDirectionalActionType = 'shorter' | 'more_thorough' | 'more_project_grounded';

const DIRECTIONAL_ACTION_TYPES: readonly string[] = [
  'shorter',
  'more_thorough',
  'more_project_grounded',
];

/**
 * One numbered section of the current body, for display beside it.
 *
 * The number is NOT the array index. It is the position among the sections whose
 * title line is actually present in the body text — the CLI's own rule: a title
 * that is not found gets no number, and the sections after it stay contiguous.
 * A number naming a heading the reader cannot see would be worse than none.
 */
export interface PeBodySection {
  /** 1-based, in body order, over the sections actually found. */
  number: number;
  /** The section's title, exactly as its title line reads without the colon. */
  title: string;
  /**
   * The composed kind, carried so the bold preview can leave alone the sections
   * the standard never marks. Numbering itself never reads it.
   */
  sectionKind: string;
  /** Logical line (0-based) of this section's title, and the first line past it. */
  titleLine: number;
  endLine: number;
}

/**
 * The two section kinds the standard never marks, restated because this package
 * cannot import the set that defines them.
 *
 *   `original_request_or_goal`   the developer's own words, quoted back — marking
 *                                them would emphasise their own prompt at them.
 *   `source_signal_guidance`     its lines propose practices by design, so the
 *                                loudest mark would land on the one section that
 *                                is a suggestion rather than the ask.
 *
 * ⛔ A mark drawn inside either is a defect, not a preference, which is why the
 * preview computes eligibility rather than trusting the phrase list.
 */
export const NEVER_MARKED_SECTION_KINDS: ReadonlySet<string> = new Set([
  'original_request_or_goal',
  'source_signal_guidance',
]);

export interface PeDirectionalAction {
  actionType: PeDirectionalActionType;
  actionId:   string;
  label:      string;
  available:  boolean;
}

/**
 * Typed render bucket for the webview — PEH-2 requires fallback/no-popup/
 * error/loading states to come from typed state, never string matching.
 */
export type PeRenderState = 'ready' | 'loading' | 'fallback' | 'blocked' | 'no_popup';

export type PePromptSendPolicy = 'send_current' | 'send_original' | 'no_send' | 'original_only' | 'no_popup';

const SEND_POLICIES: ReadonlySet<string> = new Set([
  'send_current', 'send_original', 'no_send', 'original_only', 'no_popup',
]);

/** The extension's own minimal, versioned view of a pending PE — not the full core session. */
export interface PromptEnhancementExtensionPayloadV1 {
  transportVersion:  1;
  enhancementId:     string;
  validationDecisionId: string;
  currentBodyId:     string;
  bodyRevision:      number;
  /** '' when sendPolicy is 'no_send'/'no_popup' — self-scrub, mirrors the core's own D2 rule. */
  currentBodyText:   string;
  sendPolicy:        PePromptSendPolicy;
  renderState:       PeRenderState;
  additionalDetailsAvailable: boolean;
  directionalActions: readonly PeDirectionalAction[];
  closeActionId:     string | null;
  /**
   * The body's numbered sections, when the result carries them and their titles
   * are present in the text. **Absent means no numbers** — an older result, a
   * malformed list and a body with none of its titles left all read the same
   * way, and the view renders exactly what it rendered before this existed.
   *
   * Display-only: nothing here is part of `currentBodyText`, and nothing here is
   * ever sent.
   */
  sections?:         readonly PeBodySection[];
  /**
   * The phrases the popup draws in bold, as the store holds them — text only.
   *
   * Absent means no bold, and that is the ordinary case for every prompt written
   * before the column existed.
   *
   * ⚠️ Only phrases the store actually carries can appear here, and the store
   * only ever holds locally-produced ones. A phrase marked as coming from a model
   * is runtime-only by rule and never persisted, so one arriving here would mean
   * something upstream is wrong — it is dropped rather than drawn.
   */
  emphasisPhrases?:  readonly string[];
}

/**
 * The sections of the body, numbered the way the CLI numbers them.
 *
 * This MIRRORS a rule it cannot import. `src/prompt-enhancement/**` is
 * unreachable from this package — the module header above records the TS6059
 * proof — so the one rule that matters is re-stated rather than called: a title
 * counts when some line of the body is exactly `<title>:` ignoring trailing
 * spaces, and numbering runs 1..N over the titles found, in order.
 *
 * What is deliberately NOT copied: the CLI additionally skips past an unchanged
 * section body when looking for the next title, so a heading-shaped line inside
 * a section cannot steal a later number. That case needs an EDITED body to
 * arise, and nothing here edits one — this view renders the composed text as
 * stored. A stated subset is safer than a half-copy of a rule.
 *
 * Never throws. Any shape it does not recognise yields an empty list.
 */
function parseBodySectionsV1(currentBody: unknown, bodyText: string): PeBodySection[] {
  if (!currentBody || typeof currentBody !== 'object') return [];
  const raw = (currentBody as Record<string, unknown>).sections;
  if (!Array.isArray(raw)) return [];
  const lines = bodyText.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  const out: PeBodySection[] = [];
  // FORWARD-ONLY, with a cursor, because that is what the rule says: titles are
  // matched IN ORDER. A plain "is this line anywhere in the body" test gets two
  // cases wrong — a duplicated title would let both sections claim the same
  // line, and a title appearing only ABOVE the section before it would be
  // numbered when the CLI would not find it at all.
  let searchFrom = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const title = (entry as Record<string, unknown>).title;
    if (typeof title !== 'string' || title.length === 0) continue;
    const at = lines.indexOf(`${title}:`, searchFrom);
    if (at < 0) continue;
    searchFrom = at + 1;
    const kind = (entry as Record<string, unknown>).sectionKind;
    out.push({
      number: out.length + 1,
      title,
      sectionKind: typeof kind === 'string' ? kind : '',
      titleLine: at,
      endLine: lines.length,          // closed below, once the next title is known
    });
  }
  // Each section runs to the next title found, and the last to the end.
  for (let i = 0; i < out.length - 1; i += 1) out[i]!.endLine = out[i + 1]!.titleLine;
  return out;
}

/**
 * The phrases the store holds for this prompt, or none.
 *
 * Defensive in the same way as everything else here: a malformed column, an
 * entry without text, a duplicate, or one claiming to have come from a model all
 * drop out rather than throwing or reaching the view.
 */
function parseEmphasisPhrasesV1(emphasisPhrasesJson: string | null | undefined): string[] {
  if (typeof emphasisPhrasesJson !== 'string' || emphasisPhrasesJson.length === 0) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(emphasisPhrasesJson); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.text !== 'string' || e.text.length === 0) continue;
    // Runtime-only by rule, so one here means something upstream is wrong.
    if (e.source === 'model') continue;
    if (!out.includes(e.text)) out.push(e.text);
  }
  return out;
}

function isBlockedSendPolicy(sendPolicy: string): boolean {
  return sendPolicy === 'no_send' || sendPolicy === 'no_popup';
}

function renderStateFor(
  sendPolicy: string,
  fallbackMode: unknown,
  actionLoadingState: unknown,
): PeRenderState {
  if (sendPolicy === 'no_popup') return 'no_popup';
  if (sendPolicy === 'no_send') return 'blocked';
  if (actionLoadingState === 'loading_action') return 'loading';
  if (typeof fallbackMode === 'string' && fallbackMode !== 'none' && fallbackMode !== 'previous_sendable_body') {
    return 'fallback';
  }
  return 'ready';
}

/**
 * Parse a raw `PromptEnhancementPrepareResultV1` JSON string (as stored in
 * `pending_prompt_enhancements.result_json`) into the extension's payload
 * envelope. Returns `null` on any malformed/unexpected shape. Never throws.
 */
export function parsePromptEnhancementExtensionPayloadV1(
  resultJson: string,
  /**
   * The store's own phrase column, from a DIFFERENT column of the same row —
   * which is why it is a second argument and not something read out of the
   * result. A caller that does not pass it gets a payload with no bold, exactly
   * as every caller did before this existed.
   */
  emphasisPhrasesJson?: string | null,
): PromptEnhancementExtensionPayloadV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const result = parsed as Record<string, unknown>;

  const enhancementId = result.enhancementId;
  const validationDecisionId = result.validationDecisionId;
  if (typeof enhancementId !== 'string' || enhancementId.length === 0) return null;
  if (typeof validationDecisionId !== 'string' || validationDecisionId.length === 0) return null;

  const uiView = result.uiView;
  if (!uiView || typeof uiView !== 'object') return null;
  const view = uiView as Record<string, unknown>;

  const body = view.body;
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const sendPolicy = b.sendPolicy;
  if (typeof sendPolicy !== 'string' || !SEND_POLICIES.has(sendPolicy)) return null;

  const currentBodyId = b.currentBodyId;
  if (typeof currentBodyId !== 'string' || currentBodyId.length === 0) return null;

  const bodyRevision = b.bodyRevision;
  if (typeof bodyRevision !== 'number') return null;

  const rawText = b.text;
  const text = typeof rawText === 'string' ? rawText : '';

  const actionsRaw = Array.isArray(view.actions) ? view.actions : [];
  const directionalActions: PeDirectionalAction[] = [];
  let additionalDetailsAvailable = false;
  let closeActionId: string | null = null;

  for (const entry of actionsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const a = entry as Record<string, unknown>;
    const actionType = a.actionType;
    const actionId = a.actionId;
    const label = a.label;
    const availability = a.availability;
    if (typeof actionType !== 'string' || typeof actionId !== 'string' || typeof label !== 'string') continue;

    if (actionType === 'close') {
      closeActionId = actionId;
      continue;
    }
    if (actionType === 'apply_details') {
      additionalDetailsAvailable = availability === 'available';
      continue;
    }
    if (DIRECTIONAL_ACTION_TYPES.includes(actionType)) {
      directionalActions.push({
        actionType: actionType as PeDirectionalActionType,
        actionId,
        label,
        available: availability === 'available',
      });
    }
  }

  // Computed from the text this payload actually carries, so a blocked or absent
  // body — which self-scrubs to '' below — simply has no numbers.
  const currentBodyText = isBlockedSendPolicy(sendPolicy) ? '' : text;
  const sections = parseBodySectionsV1(result.currentBody, currentBodyText);
  // A blocked body self-scrubs to '' above, so it can carry no marks either.
  const emphasisPhrases = currentBodyText.length > 0 ? parseEmphasisPhrasesV1(emphasisPhrasesJson) : [];

  return {
    transportVersion: PE_EXTENSION_PAYLOAD_TRANSPORT_VERSION,
    enhancementId,
    validationDecisionId,
    currentBodyId,
    bodyRevision,
    currentBodyText,
    sendPolicy: sendPolicy as PePromptSendPolicy,
    renderState: renderStateFor(sendPolicy, b.fallbackMode, b.actionLoadingState),
    additionalDetailsAvailable,
    directionalActions,
    closeActionId,
    ...(sections.length > 0 ? { sections } : {}),
    ...(emphasisPhrases.length > 0 ? { emphasisPhrases } : {}),
  };
}
