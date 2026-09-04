import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const fetchMock = vi.fn();

const mockOnChanged = vi.fn();
vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: mockGet, set: mockSet }, onChanged: { addListener: mockOnChanged } } },
}));

function setupDom(): void {
  document.body.innerHTML = `
    <input id="api-key" />
    <button id="test-key"></button>
    <button id="save-key"></button>
    <p id="key-status"></p>
    <input id="nexpath-token" />
    <button id="test-token"></button>
    <button id="save-token"></button>
    <p id="token-status"></p>
    <div id="frequency-group"></div>
    <div id="role-group"></div>
    <div id="self-check"></div>
  `;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadOptionsModule(): Promise<void> {
  setupDom();
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  await import('./options.js');
  await flush();
}

function els() {
  return {
    input: document.getElementById('api-key') as HTMLInputElement,
    testBtn: document.getElementById('test-key') as HTMLButtonElement,
    saveBtn: document.getElementById('save-key') as HTMLButtonElement,
    status: document.getElementById('key-status') as HTMLParagraphElement,
    selfCheck: document.getElementById('self-check') as HTMLDivElement,
    freqGroup: document.getElementById('frequency-group') as HTMLDivElement,
    roleGroup: document.getElementById('role-group') as HTMLDivElement,
  };
}

function radioFor(group: HTMLDivElement, value: string): HTMLInputElement {
  return group.querySelector(`input[value="${value}"]`) as HTMLInputElement;
}

describe('options.ts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    fetchMock.mockReset();
    mockSet.mockResolvedValue(undefined);
  });

  describe('loadKey', () => {
    it('populates the input and shows "Key saved" when a key is already stored', async () => {
      mockGet.mockResolvedValue({ openai_api_key: 'sk-existing' });
      await loadOptionsModule();

      const { input, status } = els();
      expect(input.value).toBe('sk-existing');
      expect(status.textContent).toContain('Key saved');
    });

    it('leaves the input empty when no key is stored', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { input, status } = els();
      expect(input.value).toBe('');
      expect(status.textContent).toBe('');
    });

    it('renders self-check "Not set" when no key is stored', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('Not set');
    });

    it('renders self-check "Saved" when a key is stored', async () => {
      mockGet.mockResolvedValue({ openai_api_key: 'sk-existing' });
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('Saved');
    });

    it('surfaces an error status when the initial load fails (no silent unhandled rejection)', async () => {
      // e.g. an invalidated extension context — storage.get rejects. The fire-and-forget
      // init must report this to the user, not drop it as an unhandled rejection.
      mockGet.mockRejectedValue(new Error('Extension context invalidated'));
      await loadOptionsModule();

      expect(els().status.textContent).toContain("Couldn't load saved settings");
    });
  });

  describe('project-role selector — same value set/labels/default as the CLI installer', () => {
    it('renders the 4 role options, matching the CLI picker exactly', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { roleGroup } = els();
      expect(roleGroup.querySelectorAll('input[type="radio"]').length).toBe(4);
      expect(radioFor(roleGroup, 'founder')).not.toBeNull();
      expect(radioFor(roleGroup, 'vibe_coder')).not.toBeNull();
      expect(radioFor(roleGroup, 'indie_hacker')).not.toBeNull();
      expect(radioFor(roleGroup, 'pm')).not.toBeNull();
    });

    it("defaults to founder when nothing is stored — matches the CLI installer's DEFAULT_ROLE", async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      expect(radioFor(els().roleGroup, 'founder').checked).toBe(true);
    });

    it('pre-selects the stored role value', async () => {
      mockGet.mockResolvedValue({ role: 'indie_hacker' });
      await loadOptionsModule();

      expect(radioFor(els().roleGroup, 'indie_hacker').checked).toBe(true);
    });

    it('persists the chosen role to storage on change', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { roleGroup } = els();
      radioFor(roleGroup, 'pm').click();
      await flush();

      expect(mockSet).toHaveBeenCalledWith({ role: 'pm' });
    });

    it('reflects the current role in the self-check panel', async () => {
      mockGet.mockResolvedValue({ role: 'vibe_coder' });
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('vibe coder');
    });
  });

  // Owner request 2026-08-25 (tester feedback): the Advisory Frequency control is GONE
  // from this page — it advertised control over a surface this extension no longer
  // shows (the advisory popup is removed by default, MPS-7 parity), so it read as
  // broken. These pin its absence so it cannot return by accident, and pin that the
  // page never writes the key any more.
  describe('advisory frequency is REMOVED from the settings page', () => {
    it('renders no frequency radios and no frequency row in the self-check', async () => {
      mockGet.mockResolvedValue({ advisory_frequency: 'optimum', role: 'founder' });
      await loadOptionsModule();

      const freqRadios = document.querySelectorAll('input[name="frequency"]');
      expect(freqRadios.length).toBe(0);
      const html = els().selfCheck.innerHTML;
      expect(html).not.toContain('Advisory frequency');
      expect(html).not.toContain('High');
    });

    it('never writes advisory_frequency, even when a stored value exists', async () => {
      mockGet.mockResolvedValue({ advisory_frequency: 'optimum' });
      await loadOptionsModule();

      radioFor(els().roleGroup, 'pm').click();
      await flush();

      for (const call of mockSet.mock.calls) {
        expect(Object.keys(call[0] as object)).not.toContain('advisory_frequency');
      }
    });

    it('the shipped options.html contains no frequency control', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).not.toContain('frequency-group');
      expect(html).not.toMatch(/Advisory Frequency/i);
    });
  });

  // Onboarding spec (2026-08-31): the token card must carry the exact,
  // step-wise path to a token — register link, verify, copy, paste/Save/Test —
  // so a user with no OpenAI key is never left guessing where tokens come from.
  describe('token onboarding steps (shipped options.html)', () => {
    it('walks the register -> verify -> copy -> paste path with a real signup link', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).toContain('https://parseos.tech/nexpath/signup');
      expect(html).toContain('https://parseos.tech/nexpath/login');
      expect(html).toMatch(/Create your free account/);
      expect(html).toMatch(/Verify your email/);
      expect(html).toMatch(/Copy the token/);
      // The OpenAI-key-priority rule stays stated (both cards remain valid paths).
      expect(html).toContain('takes priority');
    });
  });

  // Owner direction 2026-08-31 (settings-page restructure): token card
  // FIRST, no Advanced/Service-URL field, footer is the brand linking home.
  describe('page structure (shipped options.html)', () => {
    it('puts the Nexpath Token card before the OpenAI key card', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html.indexOf('id="nexpath-token"')).toBeGreaterThan(-1);
      expect(html.indexOf('id="nexpath-token"')).toBeLessThan(html.indexOf('id="api-key"'));
    });

    it('ships no Advanced section and no Service URL field', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).not.toContain('nexpath-base-url');
      expect(html).not.toMatch(/Advanced/);
      expect(html).not.toMatch(/Service URL/i);
    });

    it('footer is the clickable "Nexpath web" wordmark linking home — no version display, no icon', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).toContain('class="footer-brand"');
      expect(html).toContain('href="https://parseos.tech/nexpath/"');
      // The wordmark and the "web" qualifier live inside ONE anchor: the whole
      // "Nexpath web" is the click target.
      // Team lead 2026-09-02: the label is "Nexpath Website", ONE bold anchor —
      // no muted qualifier span (its grey hover read as broken).
      expect(html).toMatch(/<a class="footer-brand"[^>]*>Nexpath Website<\/a>/);
      expect(html).not.toContain('footer-web');
      expect(html).not.toContain('nexpath.dev');
      // Version display removed (owner 2026-09-01) — and no glyph/icon characters.
      expect(html).not.toContain('ext-version');
      expect(html).not.toMatch(/footer-brand[^<]*<[^>]*>[^<]*[↗➚➜→]/u);
    });
  });

  describe('save button', () => {
    beforeEach(async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();
    });

    it('shows an error and does not save when the input is empty', async () => {
      const { saveBtn, status } = els();
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('Please enter a key');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('shows an error and does not save when the key does not start with sk-', async () => {
      const { input, saveBtn, status } = els();
      input.value = 'bad-key';
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('must start with sk-');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('saves a valid key and updates status', async () => {
      const { input, saveBtn, status } = els();
      input.value = 'sk-valid';
      saveBtn.click();
      await flush();

      expect(mockSet).toHaveBeenCalledWith({ openai_api_key: 'sk-valid' });
      expect(status.textContent).toContain('Saved');
    });

    it('shows an error status when chrome.storage.local.set throws', async () => {
      mockSet.mockRejectedValueOnce(new Error('quota exceeded'));
      const { input, saveBtn, status } = els();
      input.value = 'sk-valid';
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('Save failed');
    });
  });


  describe('live refresh (storage.onChanged)', () => {
    it('re-renders the radio groups when the chooser writes the global keys', async () => {
      mockGet.mockResolvedValue({}); // arrange the initial-load read BEFORE importing the module
      await loadOptionsModule();
      const listener = mockOnChanged.mock.calls.at(-1)?.[0] as (c: Record<string, unknown>, a: string) => void;
      expect(listener).toBeTypeOf('function');
      mockGet.mockResolvedValue({ role: 'pm' });
      listener({ role: { newValue: 'pm' } }, 'local');
      await flush();
      const checked = document.querySelector('#role-group input[checked], #role-group input:checked') as HTMLInputElement | null;
      expect(checked?.value).toBe('pm');
    });

    it('surfaces an error status when a live-refresh read fails (no silent unhandled rejection)', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();
      const listener = mockOnChanged.mock.calls.at(-1)?.[0] as (c: Record<string, unknown>, a: string) => void;

      mockGet.mockRejectedValue(new Error('read failed'));
      listener({ role: { newValue: 'pm' } }, 'local');
      await flush();

      expect(els().status.textContent).toContain("Couldn't refresh settings");
    });
  });
  
});

/**
 * The docs describe this control to users and to store reviewers, and they have
 * gone stale twice on this branch already — once claiming "No telemetry …
 * nothing is sent" after the sender shipped, once claiming the extension had no
 * opt-out after this very switch shipped. Both were caught by reading, which is
 * not a mechanism.
 *
 * So: the same discipline the adapters use against the CLI, pointed at the docs.
 * If a label here is reworded, the sentence that names it has to be reworded
 * too.
 */
describe('the docs still describe this page accurately', () => {
  const cwd = process.cwd();
  const readme  = readFileSync(join(cwd, 'src', 'ext-browser', 'README.md'), 'utf8');
  const publish = readFileSync(join(cwd, 'src', 'ext-browser', 'PUBLISH.md'), 'utf8');
  const html    = readFileSync(join(cwd, 'src', 'ext-browser', 'options', 'options.html'), 'utf8');
  const page    = readFileSync(join(cwd, 'src', 'ext-browser', 'options', 'options.ts'), 'utf8');


  it('⭐ neither document claims a control the extension does not have', () => {
    // The toggle was removed on 2026-09-01 — the prompt is shown to every user.
    // These two sentences were true for exactly one release, and a privacy
    // policy that promises a switch nobody can find is the worst kind of stale.
    for (const doc of [readme, publish]) {
      const flat = doc.replace(/\s+/g, ' ');
      expect(flat).not.toContain('Never ask');
      expect(flat).not.toContain('Settings → Feedback →');
      expect(flat).not.toContain('turn the prompt off');
    }
  });

  it('⭐ the page really has no feedback toggle to claim', () => {
    // The other half: if the control ever comes back, the sentences above have
    // to come back with it, and this fails until they do.
    expect(page).not.toContain('nexpath_rating_enabled');
    expect(html).not.toContain('rating-group');
    const worker = readFileSync(join(cwd, 'src', 'ext-browser', 'background', 'service-worker.ts'), 'utf8');
    expect(worker).not.toContain('nexpath_rating_enabled');
  });

  it('⭐ the store disclosure says plainly that there is no opt-out', () => {
    expect(publish.replace(/\s+/g, ' ')).toContain('There is NO per-user opt-out');
  });

  it('PUBLISH.md no longer claims the extension has no opt-out for the OLD reason', () => {
    // The exact stale sentence this switch invalidated.
    expect(publish).not.toContain('and this one has none');
  });

  it('⭐ the privacy policy discloses the dismissal send', () => {
    // The dismissal is the ONE event that goes out without the rating click, so
    // it is the one the policy must name. The README said "Dismissing the
    // prompt sends nothing" until the event shipped — pinned so that sentence
    // cannot come back while the send exists.
    const flat = readme.replace(/\s+/g, ' ');
    expect(flat).toContain('If you dismiss the prompt, one line goes out');
    expect(flat).not.toContain('Dismissing the prompt sends nothing');
    expect(publish.replace(/\s+/g, ' ')).toContain('Dismissing the prompt sends ONE line');
  });

  it('⭐ the README does not claim nothing is sent', () => {
    // The other stale claim, kept pinned so it cannot come back.
    expect(readme).not.toContain('No telemetry');
    expect(readme).not.toContain('Nothing is sent to any Nexpath or third-party server');
  });
});

/**
 * The store-disclosure event list, against the code that sends them.
 *
 * A list a reviewer reads is only worth having if it cannot drift, and this one
 * has two ways to go wrong: an event ships that the table does not name, or the
 * table names one that no longer exists. Both are checked.
 */
describe('the store disclosure lists exactly the events the code sends', () => {
  const cwd = process.cwd();
  const publish = readFileSync(join(cwd, 'src', 'ext-browser', 'PUBLISH.md'), 'utf8');
  const sender = readFileSync(join(cwd, 'src', 'ext-browser', 'adapters', 'telemetry-send.ts'), 'utf8');
  const buffer = readFileSync(join(cwd, 'src', 'ext-browser', 'adapters', 'lifecycle-signals.ts'), 'utf8');

  /** Every event name the shipped code can put on the wire. */
  const SENT = [
    'nexpath_installed',
    'feedback_submitted', 'feedback_dismissed',
    'feedback_rating_bad', 'feedback_rating_fine', 'feedback_rating_good', 'feedback_rating_excellent',
    'pe_use_current', 'pe_use_original', 'pe_apply_details', 'pe_close',
    'mps_send', 'mps_cancel', 'mps_decline', 'mps_interruption', 'mps_apply_details',
  ];

  it('⭐ every event the code can send is named in the table', () => {
    const flat = publish.replace(/\s+/g, ' ');
    for (const name of SENT) {
      // `_fine`-style shorthand counts: the table groups the four ratings.
      const named = flat.includes(name) || flat.includes(name.replace('feedback_rating_', '_'));
      expect(named, name).toBe(true);
    }
  });

  it('⭐ and every name in the table still exists in the code', () => {
    // The table names PROPERTIES too (`feedback_at`, `action_ts`); those are not
    // events and are excluded rather than matched loosely.
    const PROPERTIES = new Set(['feedback_at', 'installed_at', 'dismissed_at', 'action_ts']);
    const inTable = [...publish.matchAll(/`(nexpath_[a-z_]+|feedback_[a-z_]+|pe_[a-z_]+|mps_[a-z_]+)`/g)]
      .map((m) => m[1]!)
      .filter((n) => !PROPERTIES.has(n));
    expect(inTable.length).toBeGreaterThan(10);          // the table is actually there
    const code = sender + buffer;
    for (const name of new Set(inTable)) {
      expect(code.includes(`'${name}'`), name).toBe(true);
    }
  });

  it('the table says the sixteen are all of them', () => {
    expect(publish).toContain('Sixteen, and no others');
    expect(SENT).toHaveLength(16);
  });
});
