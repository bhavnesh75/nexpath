# Nexpath — Browser Extension. Code Fast. Skip Nothing.

**Stop. Think. Prompt better.**

Nexpath is a **quality-engineering layer for vibe coding**. It reads the prompt you are about to
send to your AI coding agent and, when the moment matters, strengthens it *before* it reaches the
agent — catching the vague spec, the skipped test and the rushed deploy that turn AI-generated
code into a mess. Your original stays visible. Nothing is sent without your choice.

Built for indie hackers, technical founders and developers who want **code quality without giving
up the speed of AI-powered development**.

**Built for:** Replit · Lovable · Bolt — fully supported & end-to-end tested.

▶ **Watch it work** — [prompt enhancement in action](https://youtu.be/pNejtPA5DPU).

---

## What Is Nexpath?

Nexpath is an **AI coding-productivity** extension for developers using in-browser AI coding agents
like **Replit**, **Lovable**, and **Bolt**. Think of it as an **AI pair programmer** focused on
*process*, not code — it watches your session and, at key moments in your **coding workflow**,
briefly holds the prompt you are sending to offer an improved version of it.

Instead of generating code, Nexpath guides it:

> *"This prompt skips the spec check. Want to send the stronger version instead?"*

One panel. You decide. Use the suggestion, or send your original untouched — and if Nexpath can't
decide in time, your prompt goes through as-is. Never enforcing, never in the way.

---

## Why Nexpath?

Vibe coding with AI agents lets you ship features in minutes — but that speed often means skipped
spec reviews, forgotten regression checks, and missing tests. Not because you're careless, but
because momentum takes over.

Most defects in AI-generated code are not typos the agent made. They are things nobody asked for:
an **untested edge case**, a **specification gap** the agent filled with a guess, an
**architectural decision** taken by default. Each one is a **silent bug** waiting to ship, or
**unmaintainable code** waiting to pile up — and each is cheapest to fix at exactly one moment:
before the prompt is sent. That is the moment Nexpath works in.

Nexpath is the **developer-productivity** layer that complements your AI workflow without slowing
it down. Nexpath does not interrupt every prompt: it stays quiet through the early part of a
session and speaks up where a skipped step actually costs you something.

---

## Supported Agents

| AI Coding Agent | Status |
|---|---|
| **Replit** | ✅ Fully supported · end-to-end tested |
| **Lovable** | ✅ Fully supported · end-to-end tested |
| **Bolt** | ✅ Fully supported · end-to-end tested |

---

## Features

- **Submit-time review** — when a prompt is risky, Nexpath holds it and offers a stronger version
  before it reaches the agent. You choose which one to send; a held prompt is never lost.
- **Catches what nobody asked for** — the edge case that would ship untested, the specification
  gap the agent would fill with a guess, the architectural choice being made by default.
- **Flags the step you were about to skip** — the test, the spec cross-check, the pre-deploy
  review — at the moment it is still cheap.
- **3-level easier options** — can't take the full recommendation? Nexpath offers progressively simpler alternatives before logging the skip.
- **Send it straight to your agent** — accept a suggestion and Nexpath delivers it into the chat for you, or use your original prompt with one click.
- **Adapts to your style** — calibrates its tone and depth to how you prompt.
- **Runs on your key or your account** — bring your own OpenAI API key, or use a Nexpath token from
  a free Nexpath account instead.

---

## Getting Started

1. **Install** — from the **Chrome Web Store** (Chrome / Edge) or **Firefox Add-ons**.
2. Open Nexpath's **Settings** page and set up either credential:
   - a **Nexpath token** — create a free account at [parseos.tech/nexpath](https://parseos.tech/nexpath/),
     copy the token from your account page, paste it → **Save** → **Test**; or
   - your own **OpenAI API key** (`sk-…`) → **Test** → **Save**.
3. Pick your **role**, then start prompting in Replit, Lovable, or Bolt — when a prompt is worth a
   second look, Nexpath holds it and shows the suggestion right there.

---

## Requirements

- **Chrome** (or Edge/Chromium) or **Firefox 112+**.
- **One credential, REQUIRED** — either an **OpenAI API key**
  (<https://platform.openai.com/api-keys>) or a **Nexpath token** from a free account at
  [parseos.tech/nexpath](https://parseos.tech/nexpath/). Without one, Nexpath stays idle and no
  suggestions appear.

---

## Privacy

- Your **API key or Nexpath token** and settings are stored **locally in your browser** — never
  bundled or logged.
- With **your own OpenAI key**: recent prompt context is sent **only to OpenAI**, using your key,
  and only when a suggestion fires — ParseOS receives nothing.
- With a **Nexpath token**: prompt context is sent to **Nexpath's own service**, which forwards it
  to OpenAI to generate the suggestion and meters your account credit.
- **No tracking and no remote code.** There is no analytics script, no ad or tracking network, and
  no code is ever downloaded and run.
- **Usage signals stay on your machine until you choose to send them.** Nexpath keeps a local,
  content-free record of *which* popup buttons you press and *when* — a fixed list of action names
  (for example `pe_shorter`, `mps_send`) and timestamps. It never records prompt text, the text of
  an option, which site you are on, or your project path.
- **The only thing that sends is the rating prompt, and only when you answer it.** Occasionally
  Nexpath asks how it is working out for you. Choosing a rating is what sends — and it sends only
  a random installation ID (not tied to you or your machine), your 1–4 rating, and the timestamps
  above.
- **If you dismiss the prompt, one line goes out saying just that** — your installation ID and the
  time, so we can tell "asked and declined" apart from "never asked". No rating, because you did not
  give one, and the local usage signals above stay on your machine: only answering releases those.
- **In token mode the service keeps the usual service-side records** — your account details,
  payment records for Pro, usage metadata shown on your account page, and routine technical
  information associated with your account, kept to operate, secure and improve the service.
- **Your prompt text is never sold or shared.** The only places prompt text goes are the two
  routes above — OpenAI with your key, or the Nexpath service with your token. Full policy:
  [privacy policy](https://hi0001234d.github.io/nexpath/privacy.html).

---

## License

[Apache-2.0](https://github.com/hi0001234d/nexpath/blob/main/LICENSE)

---

<p align="center">
  Built by <a href="https://parseos.io">ParseOS</a> · AI developer tools for the vibe-coding era
</p>
