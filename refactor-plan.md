# Refactor plan: Astro 3→6 + Tailwind 3→4 + Markdoc migration

This document is the source of truth for execution. The conversation that produced it can be cleared without losing context.

## Refactoring Constraints

**PROHIBITED patterns — reject during implementation:**
- ❌ Re-exports for "backward compatibility" — update consumers directly
- ❌ "Functionally identical" rewrites — use exact copy-paste or centralize
- ❌ Shims, aliases, or deprecation wrappers — delete and update call sites
- ❌ Guessing interface signatures — read call sites before implementing
- ❌ Shallow keyword searches — use broad patterns, check all downstream consumers
- ❌ Bypassing a bundled function — decompose it into distinct responsibilities instead
- ❌ Manual file-by-file edits for multi-file changes — write a script with dry-run and assertions

**REQUIRED verifications — before marking complete:**
- ✅ Broad impact search completed (re-export chains, downstream consumers, validators)
- ✅ All consumers updated directly (no dual import paths)
- ✅ Architectural boundaries respected (no domain leakage between layers)
- ✅ Interface contracts verified against actual call sites
- ✅ Semantic invariants checked ("what did old code guarantee by construction?")

**Decision heuristic:** Ask "does this hide work or do work?" Hiding work is debt.

## Architectural boundaries

- **Shared submodule (`vendor/markdoc-tags`):** content-shape tags only (callout, chart, stats, legend, pipeline, quadrant, presence-grid, csv, fanout, highlight-prompt, highlight). Do not add site-specific tags here.
- **Site-local `markdoc.config.ts`:** site-specific tags only (`step`, `row`, `stepbar`, `details`). These emit DOM with site-specific CSS classes (`cli-row`, `pipeline-step-num`, `pipeline-pill`). Tag names are unprefixed — collision with shared library names would be the local file's responsibility to resolve.
- **Layouts (`src/layouts/`):** receive frontmatter and headings as explicit props; no implicit `layout:` frontmatter inheritance for collection entries (Astro 6 removed this — only `src/pages/` MDX/MD files still get implicit injection, and we're moving away from that anyway).
- **Content collections:** `post` (existing, blog) and `page` (new, for Markdoc pages). Both use loader-based collections (Astro 6 requirement).

## Resolved hidden decisions

These were silent choices in the first pass; recorded here as design memory.

| # | Question | Decision | Rationale |
|---|---|---|---|
| H1 | Site-local Markdoc tag names — prefix or unprefixed? | Unprefixed (`step`, `row`, `stepbar`, `details`) | Site-local in `markdoc.config.ts`; shared library doesn't currently use these names; collision in future is the local file's concern to resolve. |
| H2 | Stepbar attribute input format — uppercase labels or mixed-case? | Uppercase (`steps="DEFINE, FIND, GET, VERIFY, CLEAN, ANALYZE, PRESENT"`); transform derives id by lowercasing + slugifying | Preserves the original DOM output verbatim (the original component data was `{label: "DEFINE"}`); avoids introducing a CSS dependency on `text-transform: uppercase` that didn't exist before. |
| H3 | Tailwind v4 `@import "tailwindcss"` location | Modify existing `src/styles/global.css` (already imported from `BaseHead.astro:4`); replace `@tailwind base/components/utilities;` v3 directives with v4 `@import "tailwindcss";` | File already exists with Tailwind v3 directives, CSS variables (`--theme-bg` etc.), `@layer base { ... }` block, and the pipeline page's CSS (`pipeline-details`, `pipeline-pill`, `cli-row`, `cli-col1`, `cli-col2`, `pipeline-step-num`). No new file needed. |
| H4 | `tailwind.config.ts` — keep as `@config` bridge or delete? | Delete entirely; migrate content (HSL theme colors, fontFamily, backgroundImage rules) into the existing `global.css` (`@theme` block for design tokens; `backgroundImage` becomes a normal CSS rule on `.cactus-link`) | Cleanest v4-native state; `@config` bridge can't carry `corePlugins` config (which v4 removes anyway), so the bridge would already be lossy. |
| H5 | Markdoc `{% details %}` tag — emit raw `<details>` or attach existing CSS class? | Emit `<details class="pipeline-details">` so the existing styling at `global.css:406-458` (chevron caret, table styling, dark-mode variants, left border on open state) renders unchanged | The original MDX page used unstyled raw `<details>` tags — but the CSS already exists keyed on `.pipeline-details`. Either the original MDX visually had no styling (CSS dead) or the styling was applied by a parent selector. Plan implementer should verify which by checking the live site against CSS rules; if CSS is dead, omit the class. |

## Identified risks

### Structural

| Risk | Mitigation |
|---|---|
| `slug` → `id` rename across 5 files (post.slug, entry.slug, getEntryBySlug, params.slug, destructured `{slug}` patterns) | Comprehensive list below; each edit is small and TypeScript catches misses |
| `src/content/config.ts` → `src/content.config.ts` move | Astro v6 looks for the new path; old path silently ignored. Verify build succeeds after rename — no error if Astro just sees an empty collections registry |
| `src/pages/og-image/[slug].png.ts` → `[id].png.ts` rename | URL stays at `/og-image/{value}.png` because both names are URL params; verified entry.id is slug-shaped |
| `src/pages/data-pipeline.mdx` → `src/content/page/data-pipeline.mdoc` move | URL `/data-pipeline` is preserved by the new `src/pages/data-pipeline.astro` route handler |
| Deletion of `src/components/pipeline/Row.astro`, `Step.astro`, `StepBar.astro` | TypeScript catches any remaining import. Broad grep confirmed no other consumers. |
| `astro.config.mjs` integration list changes (remove prefetch + tailwind, add astro-icon + markdoc + tailwindcss vite plugin) | Sequential phases; build after each |
| `tailwind.config.ts` → delete + migrate to `global.css` (existing) | `@tailwindcss/upgrade` codemod migrates the bulk; manually migrate `backgroundImage` rules; delete config file when all content is moved out |
| `@tailwindcss/aspect-ratio` plugin removal | Drop the plugin AND the entire `corePlugins` block (7 entries including `aspectRatio: false`); v4 removes the `corePlugins` config option entirely |

### Cross-cutting

| Risk | Mitigation |
|---|---|
| Doc-code drift: stale references to old MDX page or pipeline components | No project README/docs reference these. Verify with `grep -r "data-pipeline.mdx\|StepBar\|pipeline/Row" .` after migration |
| Skill drift: `~/.claude/skills/write-markdoc/skill.md` will reference patterns this site uses | Skill update is PR #3, scheduled after migration is battle-tested |
| Skill drift: `~/.claude/skills/write-slides-build/references/migration-cheatsheet.md` migration #8 numbering | Bundled into PR #3 step 3.4 |

### Semantic — "what did old code guarantee that new code allows to vary?"

| Old guarantee | New behavior | Mitigation |
|---|---|---|
| `getEntryBySlug("post", slug)` returns guaranteed entry when called from a static path | `getEntry("post", id)` returns `T \| undefined` | For dynamic routes (og-image): pass post via `getStaticPaths` props to avoid the lookup entirely. For the `data-pipeline` single-page route: `if (!entry) throw new Error("Missing 'data-pipeline' entry in 'page' collection")` — fail build loudly, never emit a runtime redirect |
| MDX components type-checked at compile time (`<Step num={1} />` errors if num is wrong type) | Markdoc tag attributes type-checked by Markdoc's runtime schema | Define attributes with proper types in tag definitions; build fails on mismatch |
| ESM imports tree-shaken (only used components in bundle) | All registered Markdoc tags always available at parse time | Acceptable; tags are tiny |
| `entry.render()` is an instance method on every collection entry | Free function `render(entry)` imported from `astro:content` | Mechanical migration |
| `<details><summary>` inside MDX renders as native HTML | Markdoc escapes raw HTML by default | Replaced with `{% details summary="..." %}` site-local tag |
| Tailwind `border` class defaulted to gray-200 | Tailwind v4 defaults to `currentColor` | **N/A here** — verified all border usages have explicit colors |
| `entry.slug` derived from file path (legacy collection API) | `entry.id` derived by glob loader from path minus extension, with `index` segments stripped | **Verify** at PR #1 step 1.3 and PR #2 step 2.4 by `console.log(entry.id)` in a build hook — must equal `"about-us"` (post) and `"data-pipeline"` (page). Diverges silently if id derivation changes between Astro versions. |

### Architectural

| Risk | Mitigation |
|---|---|
| Site-specific tags (`step`, `row`, `stepbar`, `details`) leaking into shared submodule | Decision locked: site-local in `markdoc.config.ts`. Reviewer must reject any commit that adds these to `vendor/markdoc-tags/src/` |
| `markdoc.config.ts` becoming a kitchen sink | Only 4 site-local tags defined. Future tags should be evaluated for shared-vs-local placement |

## Files in scope

### PR #1: Astro 3→6 + Tailwind 3→4 + CI bump

**Codemod-driven (will edit many files automatically; review diffs):**
- `npx @astrojs/upgrade` — bumps Astro and all official integrations
- `npx @tailwindcss/upgrade` — migrates `tailwind.config.ts` → CSS `@theme`, renames utility classes, adds v3 border-color compat layer

**Manual edits (verified file list — 14 files modified/new/deleted + 1 verify-only):**

Content collection migration (7 files edited; 1 verify-only):

| # | File | Change |
|---|---|---|
| 1 | `src/content/config.ts` | Rename to `src/content.config.ts`; add `loader: glob({ pattern: '**/[^_]*.md', base: './src/content/post' })` to the `post` collection. **Note:** pattern is `.md` only in PR #1 — `.mdoc` is added in PR #3 alongside the about-us rename, so the pattern doesn't include extensions before their integration is registered. |
| 2 | `src/pages/blog/[slug].astro` | Line 9: `entry.slug` → `entry.id`. Line 17: `await entry.render()` → import `render` from `astro:content`, call `render(entry)`. |
| 3 | `src/layouts/BlogPost.astro` | Line 16: destructure `slug` → `id`. Line 19: `await post.render()` → `render(post)` from imported `render`. |
| 4 | `src/components/blog/Hero.astro` | Line 11: drop `render` from destructure (keep `data` and the wrapping `content`). Line 14: import `render` from `astro:content`, call `render(content)`. |
| 5 | `src/components/blog/PostPreview.astro` | Line 17: `post.slug` → `post.id` in URL template. |
| 6 | `src/pages/rss.xml.ts` | Line 16: `post.slug` → `post.id`. |
| 7 | `src/pages/og-image/[slug].png.ts` | Rename file to `[id].png.ts`. Replace `getEntryBySlug` with `getEntry` (or pass post via `getStaticPaths` props for cleaner code). `params: { slug }` → `params: { id: post.id }`. |
| — | `src/utils/post.ts` | **Verify-only.** Filter callback `({ data }) => ...` doesn't access slug/render; should still work with loader API. No edit expected; verify build passes. |

Three of these files have **render() changes** (rows 2, 3, 4); five have **slug→id changes** (rows 2, 3, 5, 6, 7).

Other manual edits (3 files):
- `src/components/SocialList.astro` line 2: `from "astro-icon"` → `from "astro-icon/components"`
- `src/layouts/Base.astro` lines 2 + 30: remove `<ViewTransitions />` import + dormant usage
- `astro.config.mjs`: remove `@astrojs/prefetch` + `@astrojs/tailwind` integrations; add `astro-icon` integration; add `tailwindcss()` Vite plugin; add `prefetch: true` config

Config and CI (4 files):
- `package.json`: remove `@astrojs/prefetch`, `@astrojs/tailwind`, `@tailwindcss/aspect-ratio`; add `astro-icon@1`, `@iconify-json/mdi`, `@tailwindcss/vite`, `tailwindcss@4`; bump `@tailwindcss/typography` to ≥0.5.16
- `tailwind.config.ts` → **delete** after migrating content to CSS. The config has more than colors — read it fully before migrating. Migrate to existing `global.css`:
  - **Theme tokens** (colors bgColor/textColor/link/accent/accent-2/quote, fontFamily) → `@theme { --color-bgColor: hsl(var(--theme-bg)); --font-sans: ...; ... }`. Verify v4 alpha-value handling: in v4 the `/ <alpha-value>` placeholder is automatic when colors are declared as CSS vars in `@theme`.
  - **`backgroundImage` theme entries** (link/strong underline gradients, lines ~122 + 125) → drop from theme; the gradient styling lives inside the custom plugin's `.cactus-link` rule and migrates with it.
  - **Custom plugin** (`addComponents` block with `.cactus-link`, `.title`, etc.) → migrate to regular CSS rules in `global.css`. The `@apply` directives within (e.g., `@apply ms-0.5`, `@apply text-2xl font-semibold text-accent-2`) keep working in v4. Each addComponents entry becomes a CSS class block.
  - **Typography prose customization** (`theme.extend.typography` with custom `code`, `sup`, `tfoot` styling) → migrate to either `@plugin "@tailwindcss/typography"` configuration (if v4 supports inline config) or to direct prose-class CSS overrides under `@layer components`.
  - **Drop the entire `corePlugins` block** (all 7 entries: touchAction, ringOffsetWidth, ringOffsetColor, scrollSnapType, borderOpacity, textOpacity, fontVariantNumeric, aspectRatio) — `corePlugins` is removed in v4 and on-demand generation makes the size optimization moot.
- `src/styles/global.css` (**modify existing**, 486 lines): replace `@tailwind base; @tailwind components; @tailwind utilities;` (lines 1–3) with `@import "tailwindcss";` and `@plugin "@tailwindcss/typography";`. Add the `@theme { ... }` block (migrated from tailwind.config.ts). Existing `@layer base { ... }`, `:root` CSS vars, `@apply` rules, `.pipeline-*`, and `.cli-*` styles are preserved unchanged (still valid v4 syntax).
- `.github/workflows/deploy.yml`: `withastro/action@v3` → `@v6`, add `with: { node-version: 22 }`

### PR #2: Markdoc migration

**Add (3 new files):**
- `markdoc.config.ts` — defines `step`, `row`, `stepbar`, `details` tags as pure transforms; spreads shared submodule tags
- `src/content/page/data-pipeline.mdoc` — content from old MDX page, rewritten in Markdoc tag syntax
- `src/pages/data-pipeline.astro` — thin route handler: `getEntry('page', 'data-pipeline')` + `render` + wrap in `DataPipeline.astro` layout

**Modify (3 files):**
- `astro.config.mjs`: add `markdoc()` integration
- `src/content.config.ts`: add `page` collection definition
- `src/layouts/DataPipeline.astro`: accept `headings` prop in addition to `frontmatter`

**Delete (4 files + 1 directory):**
- `src/pages/data-pipeline.mdx`
- `src/components/pipeline/Row.astro`
- `src/components/pipeline/Step.astro`
- `src/components/pipeline/StepBar.astro`
- `src/components/pipeline/` (empty directory after deletion — verify and remove)

**Submodule:**
- `git submodule add git@github.com:civicliteracies/markdoc-tags.git vendor/markdoc-tags`
- `pnpm add @astrojs/markdoc`

### PR #3: Polish + skill docs

**Modify (2 files in this repo + 2 files outside repo):**
- `src/content/post/about-us/index.md` → renamed to `index.mdoc`
- `src/content.config.ts` — expand `post` collection's loader pattern from `**/[^_]*.md` to `**/[^_]*.{md,mdoc}` so the renamed file is matched
- `~/.claude/skills/write-markdoc/skill.md` — append "Consuming the shared library from Astro" subsection
- `~/.claude/skills/write-slides-build/references/migration-cheatsheet.md` — fix gotcha numbering (skips from #7 to #9; renumber #9-#11 to #8-#10)

## Validator coverage

| Risk class | Existing validator | Gap |
|---|---|---|
| Broken imports | `pnpm run check` (TypeScript) catches missing imports immediately | None |
| Missing exports | TypeScript | None |
| Type errors | `pnpm run check` | None |
| Build success | `pnpm run build` | None |
| Empty directories after move | None | Manual: `find src/components/pipeline -type d -empty` after PR #2 |
| Stale doc references | None | Manual: `grep -rn "StepBar\|data-pipeline.mdx\|pipeline/Row" .` after PR #2 |
| Broken internal links to renamed routes | None | Manual: visit `/data-pipeline`, `/blog/about-us/`, `/og-image/about-us.png` after each PR |
| Visual regression on rendered HTML | None | Manual: side-by-side browser comparison at desktop + mobile widths |
| Pagefind index integrity | Implicit (postbuild step fails if pagefind errors) | Manual: search for "Define" on `/blog/` after PR #2 — should still find data-pipeline if it's indexed (TBD whether mdoc gets indexed; pagefind reads dist/, format-agnostic) |
| Tailwind border-color silent change | None | **N/A** — pre-verified all border classes have explicit colors |
| Astro v6 collection schema validation | Built-in to `pnpm run build` | None |
| Markdoc tag schema validation | Built-in to `@astrojs/markdoc` | None |

## Pre-flight commands (run before each PR)

```sh
# Verify clean baseline
cd ~/dev/civicliteracies.github.io
git status                           # should be clean
pnpm install
pnpm run check                       # baseline pass
pnpm run build                       # baseline build
```

## Broad impact searches (run BEFORE making changes; if these grow new hits, the file inventory above is incomplete)

```sh
# Slug + render() audit (expect 7 hits + 1 unrelated Resvg().render())
grep -rn "\.slug\|\.render()" src/ --include="*.{astro,ts,tsx}"

# Pipeline component consumer audit (expect zero hits outside src/components/pipeline/ and the data-pipeline page)
grep -rn "Row\|Step\|StepBar" src/ --include="*.{astro,ts,tsx,mjs,mdx}" \
  | grep -v "src/components/pipeline\|data-pipeline.mdx\|DataPipeline"

# Deprecated API audit (expect only legitimate hits in package.json + astro.config.mjs + tailwind.config.ts)
grep -rn "@astrojs/prefetch\|@astrojs/tailwind\|astro:transitions\|getEntryBySlug\|@tailwindcss/aspect-ratio" \
  --include="*.{astro,ts,tsx,mjs,cjs,json}"

# Border-without-color audit (Tailwind v4 silent change — must remain empty)
grep -rn "class=.*\bborder\b[^-]" src/ --include="*.astro" \
  | grep -v "border-[a-z0-9]\|border-2\|border-4\|border-collapse\|border-none"
```

## Phase plan

### PR #1 phases

- [ ] **1.1 Pre-flight:** clean working tree; verify baseline `check` + `build` pass; clone latest from main
- [ ] **1.2 Astro upgrade:** `npx @astrojs/upgrade` → review diff → commit `chore: upgrade astro to v6`
- [ ] **1.3 Manual edits — content collections:** rename config file, add loader (`**/[^_]*.md` only — no `.mdoc` until PR #3); slug→id in 5 files (rows 2, 3, 5, 6, 7 of the table above); render() → imported `render()` in 3 files (rows 2, 3, 4). Verify `utils/post.ts` still works without edits. Run `pnpm run check`. Commit.
- [ ] **1.3.1 Verify entry.id derivation:** add a temporary `console.log(entry.id)` to one consumer (e.g., `BlogPost.astro` line 16). Build, check that log prints `"about-us"`. If id is something else (e.g., `"about-us/index"`), pass `generateId` to the loader to produce slug-shaped ids. Remove the log before commit.
- [ ] **1.4 Manual edits — astro-icon 1.x:** import path change, `astro-icon` integration, install `@iconify-json/mdi`. Verify SocialList renders icons. Commit.
- [ ] **1.5 Manual edits — ViewTransitions removal:** remove import + usage in `Base.astro`. Commit.
- [ ] **1.6 Manual edits — prefetch:** remove integration, add `prefetch: true` config. Commit.
- [ ] **1.7 Tailwind upgrade:** `npx @tailwindcss/upgrade` → review diff carefully (codemod may not fully handle custom-plugin and prose-customization migrations) → swap `@astrojs/tailwind` integration for `@tailwindcss/vite` Vite plugin → drop `@tailwindcss/aspect-ratio` plugin → bump `@tailwindcss/typography` → in `src/styles/global.css` (already imported from `BaseHead.astro:4`): replace `@tailwind base/components/utilities;` with `@import "tailwindcss"; @plugin "@tailwindcss/typography";` and add `@theme { ... }` block migrated from `tailwind.config.ts` (theme colors + fontFamily); migrate the `addComponents` plugin (`.cactus-link`, `.title`) to regular CSS rules in `global.css`; migrate typography prose customization to `@layer components` overrides → **delete `tailwind.config.ts` entirely**. Verify `.cactus-link` underline gradient still renders, `.title` text appears as expected, and prose styling on blog posts looks unchanged. Commit.
- [ ] **1.8 CI bump:** `withastro/action@v3` → `@v6`, add `node-version: 22`. Commit.
- [ ] **1.9 Verification gate:** `pnpm run check` clean; `pnpm run build` clean; visual diff `/`, `/blog/`, `/blog/about-us/`, `/data-pipeline` desktop + mobile; OG image regenerates correctly. Run all 4 broad-impact searches above and confirm expected results.
- [ ] **1.10 Push branch, open PR, merge after review.**

### PR #2 phases

- [ ] **2.1 Add infrastructure:** install `@astrojs/markdoc`, add submodule, register integration in `astro.config.mjs`. Commit.
- [ ] **2.2 Add content collection:** add `page` collection to `src/content.config.ts` with loader. Commit.
- [ ] **2.3 Define site-local tags:** create `markdoc.config.ts` with `step`, `row`, `stepbar`, `details` transforms; spread shared tags. The `details` tag emits `<details class="pipeline-details">…</details>` (CSS already at `global.css:406-458`); `step` emits `<div class="cli-row" id={id}>` containing `<span class="pipeline-step-num">{num}</span>` + `<h2>{title}</h2>` + body; `row` emits `<div class="cli-row">` with two `<div class="cli-col1/cli-col2">` children; `stepbar` emits `<nav class="pipeline-step-bar">` with `.pipeline-pill` anchors and `.pipeline-arrow` separators. All CSS classes already exist in global.css unchanged. Commit.
- [ ] **2.4 Convert page content:** create `src/content/page/data-pipeline.mdoc` with rewritten content (Markdoc tag syntax for components, `{% details %}` for collapsible sections). Verify `entry.id === "data-pipeline"` via temporary `console.log` in the page route (remove before commit). Commit.
- [ ] **2.5 Add page route:** create `src/pages/data-pipeline.astro` calling `getEntry` + `render`. Use `if (!entry) throw new Error("Missing 'data-pipeline' entry in 'page' collection")` for the type narrow — never `Astro.redirect` for a known-required entry. Wrap rendered Content in `DataPipeline.astro` layout. Commit.
- [ ] **2.6 Update layout:** modify `DataPipeline.astro` to accept `headings` prop. Commit.
- [ ] **2.7 Delete old code:** remove `src/pages/data-pipeline.mdx`, `src/components/pipeline/{Row,Step,StepBar}.astro`, then `rmdir src/components/pipeline/`. Commit.
- [ ] **2.8 Verification gate:** `pnpm run check` clean; `pnpm run build` clean; `/data-pipeline` renders identically to PR #1 baseline (desktop + mobile); sticky nav still works (IntersectionObserver finds `.pipeline-step-bar`); pagefind builds without errors. Run cleanup searches:
  - `grep -rn "StepBar\|data-pipeline.mdx\|pipeline/Row" .` should return zero hits
  - `find src/components/pipeline -type d` should be absent
- [ ] **2.9 Push branch, open PR, merge after review.**

### PR #3 phases

- [ ] **3.1 Expand loader pattern:** `src/content.config.ts` — change `post` loader pattern from `**/[^_]*.md` to `**/[^_]*.{md,mdoc}`. Build to confirm nothing breaks (no .mdoc files yet). Commit.
- [ ] **3.2 Migrate blog post:** `git mv src/content/post/about-us/index.md src/content/post/about-us/index.mdoc`. Build + visual diff (`/blog/about-us/` should render byte-identically). Commit.
- [ ] **3.3 Update markdoc skill:** edit `~/.claude/skills/write-markdoc/skill.md` to add the "Consuming the shared library from Astro" subsection. Commit in dotfiles repo, not this site.
- [ ] **3.4 Fix slides skill cheatsheet numbering:** `~/.claude/skills/write-slides-build/references/migration-cheatsheet.md` jumps from #7 to #9 — renumber. Commit in dotfiles repo.
- [ ] **3.5 Open PR for site changes; commit dotfiles changes separately.**

## Rollback

Each PR is independent. Git revert the merge commit returns to prior state.

- PR #1 revert: site back to Astro 3 + Tailwind 3
- PR #2 revert: site back to Astro 6 + MDX (PR #1's tree still has the original `data-pipeline.mdx`)
- PR #3 revert: trivial — rename back, drop skill changes

## Success criteria

All boxes in phase plans checked + production deploy via GitHub Actions succeeds for each merged PR.
