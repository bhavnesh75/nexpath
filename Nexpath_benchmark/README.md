# We benchmarked NexPath on SWE-bench Verified. Here is what we found.

**We did not build this benchmark.** [SWE-bench Verified](https://huggingface.co/datasets/SWE-bench/SWE-bench_Verified)
is a public set of 500 real GitHub bugs from well-known Python projects, checked by human engineers,
where a fix counts only if the project's **own test suite** says so. We could only afford 40 of the 500. A seeded draw chose them — seed 20260902, spread across the dataset's own difficulty labels, frozen in strat40-manifest.json before the first run. Same seed, same 40, every time, so anyone can regenerate the list and check we did not go shopping for easy wins.

NexPath rewrites your prompt before it reaches your coding agent, and the obvious question is
whether that helps the agent write working code. So we ran the same agent over those 40 bugs twice
— with NexPath and without — and we are publishing the method, the data for every task, and a bug
we found in our own product while running it.


**Short version of the benchmark** — 40 tasks from **SWE-bench Verified**, each attempted twice by **Claude Sonnet 5**
running in Claude Code: once on its own, once with NexPath rewriting the prompt first.

| | Tasks solved | Success rate |
|---|---|---|
| Claude Code | 27 / 40 | 67.5% |
| **Claude Code + NexPath** | **29 / 40** | **72.5%** |
| **Difference** | **+2 tasks** | **+5.0 points** |

Only 2 of the 40 tasks came out differently between the two — **McNemar exact p = 0.50**.

Two more tasks solved, and **none of the task was broken that Claude Code had already solved**. But the
whole difference is 2 tasks out of 40 — this points in a direction, it does not prove a size.

We also found that a safety line NexPath adds to some prompts **stopped the agent writing
any code at all** when no human was there to answer it. There is a clean test below. If you build or test agent tools, the [part about the safety line](#the-thing-we-did-not-expect)
is probably the most useful bit here, whatever you think of NexPath.

**Just want to try it?** [Install instructions and supported agents ↓](#try-it-yourself)

---

## Why we ran this benchmark

Prompt tools are easy to show off and hard to test. The usual proof is a before-and-after
screenshot and a claim that the new prompt "looks better." That tells you nothing about whether the
code the agent writes is more likely to be right.

So we built a benchmark that answers it directly: run the same agent on the same bug, once with
NexPath and once without, and let the project's own test suite decide which patch works. **No
person scoring it, no AI scoring it** — the code either fixes the bug or it does not.

### What NexPath actually does

**It does not replace your prompt — it appends to it.** Your bug report comes back word for word,
verified on all **40 tasks**, with new sections added underneath.

**What it adds changes with the task.** Across the **38 prompts** it rewrote, NexPath drew on **57
different section types**, a median of **7** per prompt. The five most common:

| section | used in | what it gives the agent |
|---|---|---|
| **Verification Or Test Plan** | 37 of 38 | how to prove the fix works |
| **Source Signal Guidance** | 37 of 38 | which parts of the report to trust |
| **Reproduction Or Evidence** | 24 of 38 | what to reproduce before touching code |
| **Expected Actual State** | 15 of 38 | what should happen, against what does |
| **Risk Safety Or Confirmation** | 12 of 38 | what to be careful with |

---

## How we ran the benchmark

| | |
|---|---|
| Tasks | **SWE-bench Verified** — 40 tasks, picked across the dataset's own easy/medium/hard labels |
| Model | **Claude Code** (`claude-sonnet-5`), run through the same model and version in both arms |
| Without NexPath | Claude Code on its own, with a shell inside the task's container |
| With NexPath | Exactly the same, except the prompt is NexPath's rewritten one |
| Grading | The **official SWE-bench checker** — the project's own tests decide pass or fail |
| Task list | Locked in before the first run, along with the settings and a fingerprint of every prompt |

Everything else was kept the same in both runs: the task, the starting commit, the container, no
internet, a fresh copy of the code each time, the same model, time limit, spend limit, and tools.
**The prompt is the only thing that changes.**

---

## Benchmark results

| | Claude Code | Claude Code + NexPath |
|---|---|---|
| **Tasks solved** | 27/40 — 67.5% | **29/40 — 72.5%** |
| Bug's own tests pass | 27/40 — 67.5% | 29/40 — 72.5% |
| Broke something else | **0/40 — 0.0%** | **0/40 — 0.0%** |
| Ran the tests itself | 38/40 — 95.0% | 39/40 — 97.5% |
| Edited the grading tests | **0/40 — 0.0%** | **0/40 — 0.0%** |

**Task by task, compared:**

| Outcome | Tasks | What it means |
|---|---|---|
| Solved by **both** | 27 | no difference either way |
| Solved by **Claude Code only** | **0** | NexPath never made things worse |
| Solved by **Claude Code + NexPath only** | **2** | the whole difference |
| Solved by **neither** | 11 | the task beat both of them |


*"Ran the tests itself"* means the agent actually ran the project's tests before handing in its
answer. We watch this from inside the container, so it is what the agent did, not what it says it
did.

By difficulty: **easy** (4 tasks) · **medium** (30 tasks) · **hard** (6 tasks).

---

## The two tasks NexPath won

### `django__django-15022`

| | steps | patch | cost | result |
|---|---|---|---|---|
| Claude Code | **60** | 25 lines | $1.53 | **failed** |
| Claude Code + NexPath | **25** | 4 lines | **$0.46** | **passed** |

On its own the agent took 60 steps and wrote 25 lines, and still got it wrong. The same model, given
the rewritten prompt, fixed it in 25 steps with 4 lines, for a third of the cost.

**This is the full prompt NexPath produced for that task — nothing removed:**

```
My original request (verbatim):
Unnecessary joins in admin changelist query
Description
	
Django 1.2.5
Models:
class Client(models.Model):
	name = models.CharField(_('name'), max_length=256)
	name2 = models.CharField(_('unofficial or obsolete name'), max_length=256, blank=True, null=True)
	contact_person = models.CharField(_('contact person'), max_length=256, blank=True, null=True)
	...
class ClientOffice(models.Model):
	name = models.CharField(_('name'), max_length=256)
	name2 = models.CharField(_('unofficial or obsolete name'), max_length=256, blank=True, null=True)
	...
	client = models.ForeignKey(Client, verbose_name=_('client'))
	...
and admin options like these:
class ClientAdmin(admin.ModelAdmin):
	search_fields = ('name', 'name2', 'contact_person', 'clientoffice__name', 'clientoffice__name2')
	...
Numbers:
>>> Client.objects.count()
10907
>>> ClientOffice.objects.count()
16952
Now, if we try searching for clients in admin by a search query containig several words (>3), got django/admin stalled.
The problem is going to be that each word in the search query leads to additional JOIN in final SQL query beacause of qs = qs.filter(...) pattern. The attached patch is for Django 1.2.5, but adopting for the current SVN trunk is trivial.


Acceptance Or Output Expectation:
- If we do not optimize the JOINs in the admin changelist query, it could lead to timeouts or significantly slow performance when searching for clients with multiple keywords. Confirm that the output from the modified query returns the expected client results efficiently when at least three words are entered. Ensure that the search performance is improved without negatively affecting the result accuracy.

Verification Or Test Plan:
- Not verifying the implementation could mean we miss issues where query performance still lags or results remain inaccurate. Create a test plan that checks various search scenarios, particularly with increasing word counts, and define how to measure query performance before and after optimization. Include steps for verifying that the optimizations deliver the expected outcome in terms of speed and accuracy.

Source Signal Guidance:
- Failing to follow the stage transition discipline correctly could result in inadequate execution of the optimization. Document the process of breaking down the task into implementation steps, ensuring that the guidance from the 'task_breakdown → implementation' source signal is adhered to properly in updating the query architecture.
```

Everything above the first added section is the original bug report, copied back word for word.
NexPath added sections to it. This is the exact text the agent received — we record a
fingerprint of it on every run and check it against the locked list.

### `astropy__astropy-14365`

| | steps | patch | result |
|---|---|---|---|
| Claude Code | 10 | 2 lines | **failed** |
| Claude Code + NexPath | 13 | 4 lines | **passed** |

Both runs ran the project's tests. The full prompt, every step the agent took, and the patch it
wrote are published for all 40 tasks.

---

## Where neither one wins: the 11 tasks both failed

Eleven tasks beat both runs. We read all of them, because *how* an agent fails tells you more than
the score does:

```
  wrote no code at all          0 / 11
  never ran the tests           0 / 11
  Claude Code(Alone), average steps on these 11 tasks     32.7
  Claude Code(Alone), average steps on the 27 it solved   16.8
```

**Not one of these was the agent giving up.** On all 11 tasks, both runs did everything you would
want: read the code, wrote a fix, and ran the project's tests before handing it in. The fix was
just wrong — and the tests the agent chose to run did not catch it.

That is the important part. **The agent was confident and mistaken at the same time**, which no
amount of prompt detail can correct. A better prompt tells the agent what to aim at; it cannot tell
the agent that its diagnosis is wrong.

Being wrong is also expensive: **32.7 steps on average across these 11, against 16.8 on the 27
it solved** — roughly **twice the work for no result**, because an agent that is stuck keeps
trying.

**So this is the clear limit on what prompt rewriting can do.** It helps when the agent needs
direction. It does nothing when the agent has misunderstood the bug. These 11 tasks came from 6
different projects and were mostly medium difficulty, so this is not simply a matter of hard tasks
being hard.

---

## Cost

The totals favour NexPath — **$16.28 without, $14.51 with** — but that does not hold task by task.
It was cheaper on 19 of 40 and dearer on 21, and the middle difference is $0.006. **NexPath is not
cheaper per prompt.**

Where the money actually goes is more interesting:

```
  Claude Code, on the 13 tasks it FAILED    $0.661 average 
  Claude Code, on the 27 tasks it SOLVED    $0.285 average
```

**A failed task costs 2.3× a solved one**, because a stuck agent keeps burning tokens. So any money
saved comes from not getting stuck — and in our data that rests on two tasks. A question worth
testing on more tasks, not an answer.

---

## The thing we did not expect

When NexPath reads a prompt and decides the job touches something risky — deleting files, changing
a schema, handling credentials — it adds a line telling the agent to check with you first. In an
earlier 10-task pilot it did that on **34% of the prompts it rewrote (15 of 44)**:

> *"Still, before you do this destructive file or codebase change you must ask me for go-ahead
> confirmation."*

**With a person at the keyboard, that is exactly right.** You want to be asked before something
irreversible happens.

**With no person there, it is fatal.** The agent follows the instruction, asks for permission, and
waits for an answer that is never coming. It writes nothing — and from the outside that looks
identical to a model that could not solve the problem.

`django__django-11179` is the clearest example. The agent found the bug, named the function and the
exact lines, and worked out the one-line fix. It had the answer. Then it stopped and asked:

> *"This is a destructive change to source code — may I proceed?"*

No patch. **The same model, on the same task, without that line, solved it in 9 steps.**

**So we tested the sentence on its own.** Same task, same prompt, six runs each way, spread across
two sittings. The one sentence was the only thing that changed between them:

```
  with the line       5 of 6 wrote no code
  without the line    0 of 6 wrote no code
```

**Every patch written without the line was identical to the others, and every one passed the
project's real tests.** The work was never the problem. **One sentence — 104 characters — decided
whether there was any code at all.**

One run wrote code despite the line, and that is worth saying plainly: **these agents are not
repeatable.** The effect here is strong, not absolute.

**The fix:** when NexPath is told it is running with no person available, it drops that line and
the check that demands it — both together, because removing only the line left the check behind and
the agent still stalled. Nothing else in the safety system changed, and **normal interactive use
behaves exactly as it did before.** Every result above was run with this fix in place.

**If you build tools for agents, this is the part worth taking away.** Guidance written for a human
reader can silently halt an agent that has nobody to ask. **Nothing throws, nothing gets logged,
and the failure is indistinguishable from the model simply being bad at the job.**

---

## Why we think the benchmark numbers hold up

- **We check the exact prompt the agent got.** All 40 match the locked list, and the plain runs
  match the untouched bug report on all 40.
- **No AI grades anything.** Pass or fail comes from the project's own tests, run in its own
  container. We added one rule stricter than SWE-bench's: if a run edits the tests it is graded on,
  it fails. Neither side did.
- **We alternated which one goes first**, 20 and 20, decided in advance. Both runs happen back to
  back on each task, so anything that drifts over eight hours cannot land on one side.
- **We measured whether NexPath leaked into the plain runs.** 
  check around every call. It leaked **0 times out of 40**.
- **These numbers come from an unreleased build** — `main` plus the fix described
  above and a change to how reviewed prompts are written. They do not describe the
  version you can install today; the released one still adds the confirmation line.

**Running the whole benchmark cost about $41** in agent spend, across 80 runs and roughly eight hours.

---

## The benchmark data

Everything you need to check this or run it yourself:

| file | what it is |
|---|---|
| [`final_per_task.csv`](final_per_task.csv) | all 40 tasks, both runs, every measurement |
| [`final_summary.json`](final_summary.json) | every metric, and the paired outcome for each task |
| [`strat40-manifest.json`](strat40-manifest.json) | the locked task list — IDs, settings, prompt fingerprints |
| [`preflight-strat40.json`](preflight-strat40.json) | the checks we ran on all 40 prompts before starting |
| [`popups/`](popups/) | per task: the full prompt, the fingerprint trail, every step, the patch |
| [`gate-experiment-BEFORE-fix.jsonl`](gate-experiment-BEFORE-fix.jsonl) | raw data — the safety-line test, before the fix |
| [`gate-experiment-AFTER-fix.jsonl`](gate-experiment-AFTER-fix.jsonl) | raw data — the same test, after the fix |

Start with the two tasks NexPath won:
[`django__django-15022`](popups/django__django-15022.txt) ·
[`astropy__astropy-14365`](popups/astropy__astropy-14365.txt)

---

## Try it yourself

Nexpath is a local CLI. It captures the prompt you were about to send, returns a reviewed version,
and you decide whether to use it.

---

### installation Commands: (Claude CLI)

```bash
git clone https://github.com/hi0001234d/nexpath.git
cd nexpath
npm install
npm run build
npm link

nexpath install      # registers with your coding agent
nexpath --version
```

### Supported AI Coding Agents & Developer Tools

Nexpath CLI is built for prompt capture across AI coding agents.

| Agent | How to install | Status |
|-------|----------------|--------|
| **Claude Code** | [Nexpath CLI](https://github.com/hi0001234d/nexpath) | Live and tested — **and what this benchmark measured** |
| **Cursor** | [VS Code extension](https://marketplace.visualstudio.com/items?itemName=nexpath.nexpath-vscode) | Live and tested |
| **Windsurf** | [VS Code extension](https://marketplace.visualstudio.com/items?itemName=nexpath.nexpath-vscode) | Live and tested |
| **Replit** | Browser extension — [Chrome](https://chromewebstore.google.com/detail/gdkknhjgflkkeajbhalkaakohpoflolc) · [Firefox](https://addons.mozilla.org/en-US/firefox/addon/nexpath/) | Live and tested |
| **Lovable** | Browser extension — [Chrome](https://chromewebstore.google.com/detail/gdkknhjgflkkeajbhalkaakohpoflolc) · [Firefox](https://addons.mozilla.org/en-US/firefox/addon/nexpath/) | Live and tested |
| **Bolt.new** | Browser extension — [Chrome](https://chromewebstore.google.com/detail/gdkknhjgflkkeajbhalkaakohpoflolc) · [Firefox](https://addons.mozilla.org/en-US/firefox/addon/nexpath/) | Live and tested |

**One thing to be precise about:** all six are live, but **the benchmark on this page ran only on
Claude Code**. The numbers above describe that pairing. We have not run the same 40 tasks through
the other agents, so nothing here should be read as a measurement of them.

**Using an agent that is not on this list?** Open an issue and tell us which one — that is how the
list gets ordered.

- **Watch it work:** [Prompt Enhancement in action](https://youtu.be/pNejtPA5DPU)
- **Report a problem or request an agent:** [Issues](https://github.com/hi0001234d/nexpath/issues)
- **Everything stays local.** Prompts are stored at `~/.nexpath/`, secrets are stripped before
  storage, and only targeted classification calls leave your machine.

---

## What is next — and what we want from you

**Two tasks is a direction, not a result.** The next run needs more tasks, more hard ones, and it
needs to happen more than once before the size of the gap means anything. We will publish it the
same way we published this one: **method first, data attached, whatever it says.**

Three kinds of feedback would help more than anything else:

- **Run NexPath on your own code and say what happened.** Forty bugs from six Python projects is
  not your codebase. **If it does nothing for you, that is the more useful answer** — it is exactly
  what a benchmark like this cannot tell us.
- **Try to break the method.** Every number on this page comes from a file in this folder. If
  something does not add up, or you think the two wins were luck, say it plainly and point at the
  file.
- **Tell us which agent you actually use.** We measured Claude Code. What people really run decides
  what we test next.

➜ **[Leave your feedback here](https://github.com/hi0001234d/nexpath/discussions/94)** — one thread,
open to anyone. **We read every reply**, and we would rather hear the hard version now than defend
the numbers later.
