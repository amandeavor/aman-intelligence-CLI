# Bootstrap Install Design — aman-cli

**Goal:** Users discover Aman via `npx aman-cli`, then optionally get permanent `aman` on PATH—with **explicit consent** and safe cross-platform behavior.

---

## Current state (v0.0.1 behavior in code)

Bare `npx aman-cli` → **immediate** `npm install -g aman-cli@<version>` without menu or confirmation.

| Pros | Cons |
|------|------|
| One command after publish | **Silent global install** — trust/security concern |
| Simple mental model (“npx installs it”) | Fails on permission errors with little context |
| Works in CI only if unintended | Surprises users expecting ephemeral npx |
| | Violates “no silent global installs” requirement |
| | Re-runs on every bare `npx aman-cli` |
| | `aman-cli` global bin repeats installer |

**Security implications of current approach:**

- Any compromised or typosquatted package run via npx could trigger global installs (industry-wide npx risk, amplified if normalized).
- Users cannot audit what will be installed globally before it happens.
- Corporate locked-down machines may block `-g` and produce opaque failures.

---

## Recommended approach (v0.1.x → v0.2.0)

### Principle

**Separate “try” from “install.”**

| User intent | Command | Behavior |
|-------------|---------|----------|
| Try / discover | `npx aman-cli` | Interactive or text **welcome menu** (TTY) / concise options (non-TTY) |
| Run once | `npx aman-cli <cmd>` | Ephemeral execution (unchanged) |
| Install permanently | User chooses menu → prints or runs `npm install -g aman-cli` | **Explicit opt-in** |

### Welcome menu (TTY)

```text
Aman — package manager for AI workflow assets

Aman is not installed globally.

❯ Install globally (recommended)
  Run once without installing (ephemeral)
  Exit

```

**Install globally:**

1. Show exact command: `npm install -g aman-cli@0.1.0`
2. Ask: `Proceed? (y/N)`
3. On `y`: run `npm install -g aman-cli@<version>` with inherited stdio
4. On success: `Run: aman init --local`
5. On failure: explain permissions, suggest `sudo` only on Unix if appropriate, link to docs

**Run once without installing:**

- Launch ephemeral flow: `npx`-style **non-global** path — e.g. `doctor` or minimal “quick start” using package from cache
- Or print: `npx aman-cli init --local` / `npx aman-cli doctor`

**Non-TTY:**

```text
Aman is not installed globally.
  Install:  npm install -g aman-cli
  Try once: npx aman-cli doctor
```

Exit 0 (informational), not auto-install.

### Optional: `--install-global` flag

```bash
npx aman-cli --install-global
```

For scripts/CI that intentionally want current behavior with explicit flag (not default).

---

## Alternative designs considered

### A. postinstall script

`npm install aman-cli` runs global hook.

| Pros | Cons |
|------|------|
| Automatic on local install | Never runs for pure npx ephemeral |
| | Hated pattern; surprises `npm install` in projects |

**Rejected** for default.

### B. Separate package `@aman/installer`

`npx @aman/install` only installs CLI.

| Pros | Cons |
|------|------|
| Clear separation | Two packages to maintain; discovery friction |

**Deferred** unless brand wants split.

### C. Keep auto global install (status quo)

**Rejected** for public release per consent requirement.

### D. Print command only (no spawn)

Menu selection prints `npm install -g aman-cli`; user copies.

| Pros | Cons |
|------|------|
| Zero permission issues in npx | Extra friction |

**Use as fallback** when spawn fails or non-TTY.

---

## Implementation sketch (no architecture change)

1. `src/cli/bootstrap.ts` — `detectGlobalAman()`, `showBootstrapMenu()`, `runGlobalInstallWithConsent()`
2. Replace early exit in `aman.ts` when `isAmanCliEntrypoint() && no args`:
   - If global `aman` already on PATH and version ≥ current → print “Already installed” + `aman --version`
   - Else → bootstrap menu
3. Do **not** trigger bootstrap when `aman` bin (not `aman-cli`) is invoked
4. Deprecate silent install; gate behind `AMAN_INSTALL_GLOBAL=1` for one release cycle if needed

**Windows / macOS / Linux:**

- Use `npm.cmd` on Windows with `shell: true` only when spawning
- Detect global binary via `where aman` / `which aman` (parse carefully on Windows)
- Handle EACCES with message pointing to npm docs for prefix

---

## Security implications (recommended design)

| Risk | Mitigation |
|------|------------|
| Typosquatting | Official README only links `aman-cli`; npm 2FA; scoped org later |
| Silent global install | **Removed**; explicit y/N |
| Supply chain in `-g` | Same as any global npm package; pin version in command |
| Running as root | Discourage `sudo npm`; document `npm config set prefix` |

---

## First-run onboarding (after global install)

Bootstrap installs **CLI only**. Still require:

```bash
aman init --local   # or --github
aman doctor
```

Optional: after successful global install, offer to run `aman init --local` in same session (with second consent).

---

## Recommendation summary

| Item | Decision |
|------|----------|
| Default `npx aman-cli` | **Guided menu**, not silent `npm install -g` |
| Global install | Opt-in + confirmation |
| Ephemeral use | `npx aman-cli <command>` unchanged |
| Explicit flag | `--install-global` for automation |
| README | Match behavior exactly |

**Priority:** Implement before marketing `npx aman-cli` to thousands of developers.
