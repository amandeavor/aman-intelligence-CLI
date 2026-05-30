# Package Size Optimization — aman-cli@0.1.0

---

## Current state

| Metric | Value |
|--------|--------|
| Files in tarball | **552** |
| Packed (gzip tarball) | **~666 KB** |
| Unpacked | **~2.4 MB** |

### Measured workspace breakdown (source folders in repo)

| Folder | Files | Unpacked size | % of asset bulk |
|--------|-------|---------------|-----------------|
| `skills/` | 353 | **~1.91 MB** | **~80%** |
| `dist/` | 170 | **~475 KB** | **~20%** |
| `prompts/` | 22 | ~8 KB | &lt;1% |
| `mcps/` | 4 | ~1.4 KB | &lt;1% |

Packed size is much smaller than unpacked because markdown/text compresses well.

---

## 1. Why is file count high?

| Driver | Approx files | Cause |
|--------|--------------|-------|
| **vercel-optimize** skill | ~200+ | references/, lib/*.mjs, scripts/, support-topics |
| **react-best-practices** | ~70+ | rules/*.md per rule |
| **react-native-skills** | ~40+ | rules/*.md |
| **Other skills** | ~40 | Normal SKILL.md trees |
| **dist/** | 170 | ~85 `.js` + ~85 `.d.ts` (duplicate surface) |
| **prompts** | 22 | 11 × (metadata + PROMPT) |

**Conclusion:** File count is high because the package ships a **full skill catalog**, not because dev artifacts leak into npm.

---

## 2. Do bundled skills/prompts/mcps justify the size?

| Argument for keeping | Argument for trimming |
|---------------------|------------------------|
| Offline `aman browse` / `install caveman` works day one | Power users may never need vercel-optimize in npm |
| Doctor checks “bundled assets present” | Registry/marketplace can deliver assets later |
| Matches “package manager” metaphor (like shipping templates) | Competitors (raw npm) ship minimal CLI |

**Recommendation:** Keep a **small starter set** in npm; move **large reference skills** to GitHub + optional download or registry publish.

**Starter set (suggested, ~15–25 files total):**

- Skills: `caveman`, `brainstorming`, `find-skills`, `web-design-guidelines`, `writing-plans` (example)
- Prompts: 2–3 with real PROMPT content
- MCPs: `filesystem`, `github`

---

## 3. Should default assets be reduced?

**Yes, moderately** for v0.2.0 — not aggressively for v0.1.0 if release is imminent.

| Tier | Action | Risk to first-run |
|------|--------|-----------------|
| **v0.1.0 ship** | Keep current bundle; document size | Low risk |
| **v0.1.1** | Remove `vercel-optimize` from npm; keep on GitHub | Low — still many skills |
| **v0.2.0** | “Starter pack” only in npm | Medium — update docs/quick start |

---

## 4. Should runtime assets be lazy-loaded?

| Approach | Description | Fits architecture? |
|----------|-------------|-------------------|
| Download on `aman init` | Fetch starter pack from GitHub release | **Yes** — no install-time *execution* of asset scripts |
| Registry-first install | Empty npm package; `aman install @aman/starter` | **Yes** — requires published registry |
| Optional `aman bundle fetch` | Explicit user command | **Yes** |

**Not recommended:** Lazy-load per command without user awareness (surprise network).

**Recommended (medium term):** npm ships **minimal CLI + 3–5 demo assets**; `aman init` offers to install “Starter pack” from registry or GitHub zip.

---

## 5. Should example assets move to GitHub only?

| Asset class | GitHub only? |
|-------------|--------------|
| vercel-optimize (full tree) | **Yes** — best candidate |
| react-best-practices rules | **Optional** — popular but large |
| AGENTS.md duplicates | **Yes** — doc for agents, not required in npm |
| prompts (empty bodies) | Trim or fill — low priority |

---

## Optimized scenarios (estimates)

| Scenario | Files | Unpacked | Packed (est.) | Savings |
|----------|-------|----------|---------------|---------|
| **Current** | 552 | 2.4 MB | 666 KB | — |
| **Strip dist `.d.ts`** | ~467 | ~2.2 MB | ~620 KB | ~15% packed |
| **Remove vercel-optimize from npm** | ~350 | ~1.5 MB | ~450 KB | **~30% packed** |
| **Starter pack only** | ~80 | ~400 KB | ~150 KB | **~75% packed** |
| **CLI-only (no skills)** | ~170 | ~475 KB | ~200 KB | **~70% packed** |

---

## Risks of optimization

| Change | Risk |
|--------|------|
| Remove bundled skills | `aman install caveman` fails offline; doctor warns |
| Lazy-load without init | Broken first impression |
| Shrink dist | Accidentally omit required module |
| Split packages | Maintenance burden |

**Guideline:** Do not optimize aggressively if it hurts first-run experience. **v0.1.0:** document size; **v0.2.0:** starter pack split.

---

## Recommended action plan

| Priority | Action | Version |
|----------|--------|---------|
| P0 | Document actual tarball contents (`NPM_PACKAGE_AUDIT.md`) | 0.1.0 ✓ |
| P1 | Fix bootstrap consent (not size) | 0.1.1 |
| P2 | Omit `dist/**/*.d.ts` from publish | 0.1.1 |
| P3 | Move `vercel-optimize` to GitHub-only bundle | 0.2.0 |
| P4 | `aman init` optional starter pack download | 0.2.0 |

---

## Conclusion

**666 KB packed is acceptable** for a CLI that ships a rich demo catalog. The count is **justified but optimizable**. Do not block v0.1.0 npm publish on size alone; block on **bootstrap UX** instead.
