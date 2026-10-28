# Working on Cortana Electron

Use this guide to get oriented and make sound decisions. Investigate, implement,
verify and finish ordinary authorized work independently. Choose checks that fit
the change; a wording fix does not need an installer build. Question existing
code when evidence supports a better approach, and keep useful discoveries in the
code, tests or relevant documentation rather than adding ceremony here.

## Project identity

Cortana Electron is a Windows desktop recreation of the classic Cortana assistant,
built with Electron, vanilla JavaScript, HTML and CSS. It combines typed and voice
commands, local Notebook data, reminders and timers, Windows integrations, web
search and optional replies from an OpenAI-compatible provider. Local AI servers
are supported; an online AI account is not required for built-in commands.

Preserve the nostalgic Windows 10 Cortana character: flat, square controls,
Segoe UI typography, accent-coloured original illustrations, circle animations
and familiar interaction patterns. Improve usability without casually replacing
the interface with a modern dashboard or a different assistant identity. Changes
should work in both the classic frameless mode and the movable window mode.

Read [README.md](README.md) for the user-facing overview, setup and known limits.
Keep the Nana story, personal warmth, acknowledgments and Microsoft non-affiliation
notice intact unless the task specifically calls for changing them. Preserve
[LICENSE](LICENSE) (GPL-3.0) and existing asset credits; do not invent ownership or
redistribution rights for Microsoft's artwork or voices.

## Where things live

| Area | Responsibility |
| --- | --- |
| `main.js` | Electron startup/window/tray lifecycle, validated IPC handlers, settings and Notebook storage, reminder scheduling, application/file discovery, network integrations, TTS and native service wiring. |
| `renderer.js` | UI state and navigation, search and command routing, Notebook/settings/reminder views, speech playback, `GifRenderer` and `AnimationManager`. |
| `preload.js`, `lib/ui-bridge.js` | Named `window.cortana` capabilities and the renderer's compatibility wrapper. The renderer's `ipcRenderer` variable is this wrapper, not unrestricted Electron IPC. |
| `index.html`, `style.css` | UI markup, Content Security Policy, shared styling, motion and responsive behaviour. Browser helper scripts load before `renderer.js`; preserve their dependency order. |
| `lib/speech-controller.js` | WinRT recognition, wake/manual capture coordination, cancellation, timeouts, resource disposal and diagnostic error details. |
| `lib/preferences.js`, `lib/startup.js` | Serialized/atomic persistence, validation/migrations, and installed-app Windows startup state and rollback. |
| `lib/lists.js`, `lib/recurrence.js`, `lib/timers.js`, `lib/first-run.js` | Named-list parsing/data rules, calendar recurrence, persistent named timers, and the welcome tour. |
| Other `lib/` helpers | GIF decoding/worker loading, audio input and voice policies, AI endpoint normalization, shortcut parsing, release validation and weather commands. Several expose both CommonJS exports and browser globals. |
| `speech.ps1`, `media.ps1` | Read-only audio endpoint inventory, and default playback-device volume/mute control, respectively. Speech recognition itself runs through WinRT in JavaScript. |
| `assets/` | Original GIF illustrations, icons and audio cues used by development and packaged builds. Treat these as source assets. |
| `package.json`, `package-lock.json`, `winapp.yaml`, `Package.appxmanifest` | Runtime/dependencies, Electron Builder packaging and Windows binding/identity inputs. |
| `test/`, `scripts/` | Node unit/regression tests, syntax checks, real Electron workflow checks, packaging prerequisites and optional native diagnostics. |

There is no frontend bundler or framework migration needed for ordinary changes.
Follow the surrounding JavaScript style; avoid repository-wide formatting churn.
Use existing modules and dependencies first. Extract cohesive helpers when useful,
preserving their Node/browser loading contracts.

## Development and verification

Start with `git status --short`, the affected implementation, its callers, tests
and relevant history. Preserve uncommitted work and generated evidence belonging
to other tasks. Do not reset, clean or overwrite unrelated files to simplify work.
For significant or destructive changes, establish a suitable backup or recovery
path first. Fix causes, and include nearby improvements when they directly support
the task; avoid speculative rewrites and unrelated cleanup.

Use Windows and Node.js **22.12 or newer**, as specified by `package.json` and the
README. Windows 11 x64 is the documented tested environment; Windows 10 and ARM64
need their own acceptance evidence. Use the lockfile for reproducible installs.

Run commands from the repository root:

| Command | Purpose and limits |
| --- | --- |
| `npm ci` | Install locked dependencies; `postinstall` runs `electron-builder install-app-deps`. |
| `npm start` | Start source development; `prestart` ensures matching WinRT bindings. This uses the normal app profile. |
| `npm start -- --speech-debug` | Opt-in speech stage logging for deliberate troubleshooting. |
| `npm run check` | JavaScript syntax checks across app files, `lib`, `scripts` and `test`; not a linter or type checker. |
| `npm test` | Node's built-in test runner over `test/*.test.cjs`. Some tests extract renderer code into a VM; passing these alone does not establish real UI/native behaviour. |
| `npm run smoke -- --workflows` | Real Electron UI workflows in a disposable profile; default is movable mode. Microphone actions are simulated. |
| `npm run smoke -- --workflows --classic` | Corresponding workflows in classic window mode. |
| `npm run checkup` | Broader integration coverage: commands, cancellation, persistence, timers, reminders and a local AI fixture. Desktop actions are intercepted. |
| `npm run checkup -- --live` | Adds explicit public-service checks for weather, search, Wikipedia, Edge synthesis, release checks and Everything availability. Does not prove microphone recognition or audible output. |
| `npm run smoke:productivity` | List, reminder, timer, My day and related integration checks. |
| `npm run smoke:tour` | Welcome-tour interaction and persistence checks. |
| `npm run generate-bindings` | Force regeneration of Windows bindings when needed. |
| `npm run dist` | Ensure bindings and build the default NSIS Windows installer into `dist/`. Does not publish a release. |
| `npm run dist:msix` | Build the optional AppX target despite the script's name; this is not the normal public installer path. |

Choose verification by impact:

- **Documentation only:** check wording, links, referenced paths and commands, and
  the final diff. App launches and builds usually add no value.
- **Logic or persistence:** run syntax checks and relevant tests; normally run the
  full unit suite for application changes. Add regression coverage for the defect
  or meaningful failure path, rather than tests that simply restate the code.
- **UI, IPC or lifecycle:** add real Electron checks and inspect affected screens
  in both window modes. Include focus, scrolling, keyboard access, long content,
  reduced motion and interrupted/repeated navigation when relevant.
- **Native integrations, dependencies or packaging:** inspect compatibility and
  security implications, run suitable integration checks, and verify the packaged
  app. Use `npm audit` where dependency/release work warrants it; investigate
  findings before changing versions rather than using a blanket forced fix.

Focused helpers can be run with the installed Electron, for example:
`npx --no-install electron scripts/motion-smoke.cjs --classic`.
Other helpers are `opening-smoke.cjs`, `performance-smoke.cjs`, `close-smoke.cjs`
and `weather-update-smoke.cjs` under `scripts/`. Read a helper before choosing its
flags: the weather/update helper contacts live weather unless `--offline` is used.
Tour upgrade coverage includes
`npm run smoke:tour -- --existing --legacy-complete --reset-tour`; also exercise
fresh install, finish, skip and restart when changing tour migrations.

Workflow reports, screenshots and disposable profiles go under `.verification/`.
Use distinct `--label=` values on helpers that support them to retain useful
evidence. The absence of `--live` skips checkup's explicit service probes; ordinary
application initialization can still make network requests. Existing smoke
fixtures disable wake capture and startup registration; keep that isolation when
extending them. Do not point persistence tests at someone's normal profile.

## Preserve data and established behaviour

- Runtime files live under Electron's `app.getPath('userData')`: `settings.json`,
  `notebook.json`, `reminders.json`, `timers.json` and `speech-diagnostics.jsonl`.
  Resolve the actual path rather than assuming a particular installation folder.
  Settings can contain API keys and custom commands: never commit or copy personal
  profiles into reports, fixtures or release assets.
- Preserve serialized mutations and atomic writes. Report success and update
  committed state only after storage succeeds. Unreadable data must stay protected
  from replacement; corrupt settings require a successful backup before recovery
  writes. Failed reminder edits/deletions must retain their previous schedule,
  and failed saves must leave user drafts available to retry.
- Keep old Notebook Tasks/profile fields and saved preferences compatible.
  First-run completion is a versioned migration marker, not just a boolean.
  Finish/skip must survive restarts and preference resets. Do not tie showing the
  tour to every future app version without a deliberate migration decision.
- Recurring reminders use local calendar time, including daylight-saving changes.
  Missed repeats deliver one overdue alert and advance; restored overdue timers
  alert once after their removal is persisted. These alerts require Cortana to
  run. Test restart/resume and write failures when changing scheduling.
- Direct queries prioritize custom actions, then assistant skills, other built-in
  commands, optional AI and web fallback. Explicit built-in search-result actions
  must bypass custom-action routing. Reuse `executeAssistantSkill` for a matched
  skill rather than re-entering `processQuery` and changing precedence.
- Keep request-generation and speech-output cancellation guards. A slow response,
  animation load or completed utterance must not overwrite a newer request,
  revive cancelled speech or replace the Notebook after navigation.
- Preserve original GIF pixels, proportions, transparency, tint and authored frame
  timing. Keep decode work off the UI path and hidden/inactive animations paused.
  First paint should not wait for the online voice list.

## Desktop, speech and security boundaries

The main process owns privileged operations. Keep `nodeIntegration: false`,
`contextIsolation: true`, the Content Security Policy and navigation restrictions.
The window currently uses `sandbox: false`; do not describe it as fully sandboxed.
Expose only named capabilities through `preload.js` and update `lib/ui-bridge.js`
alongside them. Validate inputs in the main process as well as the UI. Treat web,
AI and search content as untrusted text; preserve URL/path/command validation and
do not expose a generic IPC or shell execution bridge to remote content.

AI replies are optional and built-in commands work independently. Preserve
OpenAI-compatible endpoint normalization and parsed loopback detection for offline
local servers. Keep personal Notebook/profile content out of AI requests unless
the user explicitly requests a feature that sends it. Never log API keys,
recognized speech or personal query contents in speech diagnostics.

Service integrations include DuckDuckGo embedded results, Google suggestions,
Open-Meteo weather, Wikipedia, Edge TTS and GitHub releases. The browser search
engine preference is separate from embedded results. Optional Everything file
search uses a local HTTP service; preserve its loopback-only access. Check offline,
timeout and unavailable-service behaviour when changing these integrations.

Recognition uses `@microsoft/dynwinrt` and generated Windows bindings. Keep the
runtime and code generator versions matched, and inspect `winapp.yaml` and
`package.json` binding inputs together. `.winapp/` is generated and ignored;
`scripts/ensure-bindings.cjs` checks an input signature before restoring it.
Regenerate through the existing tooling rather than editing generated bindings.

Maintain one coordinated microphone lifecycle, bounded native operations,
unsubscription/disposal and cancellation before TTS. Wake listening is opt-in.
Recognition failures and the physical speaker pop are documented unresolved
problems on affected systems: mocks, initialized bindings and a successful build
are not evidence that either is fixed. Confirm real results on affected hardware
before changing those claims. `scripts/probe-winrt.cjs` opens the real default
microphone; use it only for deliberate speech testing within the task's scope.

Edge TTS has a system-voice fallback. Keep the user's saved engine/voice choice
when falling back, including unavailable Eva preferences. Prefer regular Zira over
Zira Desktop when resolving a local default. Updates must not install or replace
Windows voice assets or silently change speech consent/audio settings.

Windows startup belongs to the installed NSIS app and uses its own executable
and `--hidden`. Development and diagnostic runs must not register Electron for
startup. Respect entries disabled in Windows Startup Apps; explicit re-enabling
must be verified, and save failures must attempt rollback and report actual state.
Optional `identity:dev` registers a development identity and modifies the local
Electron executable; `identity:remove` restores a version-matched backup. These
are deliberate diagnostic tools, not prerequisites for normal users or tests.

## Release preparation and publication

Use investigation → implementation → verification → documentation → release
preparation → publication → follow-up as a flexible lifecycle. Preparation and
publication are separate actions. Do not bump versions, create releases (including
drafts), publish tags, replace assets, alter published versions or deploy without
explicit authorization. A commit/merge authorization does not authorize pushing,
release publication or production changes.

When preparing **or evaluating** release notes:

1. Identify the actual previous **published** release and the intended target.
   Read [GitHub releases](https://github.com/SoftBluey/Cortana-Electron/releases),
   including historical notes and asset lists. Distinguish drafts/prereleases from
   stable publications. Do not assume the highest local tag or README version is
   the previous public release, or that a release's moving `target_commitish`
   identifies its exact source; resolve its tag to a commit.
2. Compare that release's commit against the exact target commit/tree. After
   substituting verified refs for `PREVIOUS_TAG` and `TARGET_REF`, use
   `git log --oneline PREVIOUS_TAG..TARGET_REF` and
   `git diff PREVIOUS_TAG TARGET_REF`, then inspect relevant files and commits.
   If refs or source provenance are missing, obtain the evidence or state the
   limitation. A comparison with an intermediate working copy is insufficient.
3. Separate genuinely new features, improvements to existing features, confirmed
   fixes, internal maintenance and remaining issues. A feature's presence today
   does not make it new. Check each claim against both versions and the relevant
   behaviour. Exclude uncommitted/later changes from tagged-release claims.
4. Write user-focused notes, using **New**, **Improved**, **Fixed** and **Still
   working on it** where useful. Explain practical effects and supported examples.
   Keep partial fixes and untested claims explicit. Do not silently rewrite
   historical notes; make corrections only for a specific justified reason/task.

Historical developer reports are available through Git, for example
`git ls-tree -r --name-only v8.0.0 docs` and
`git show v8.0.0:docs/release-8.0.0.md`. They are historical evidence, not current
verification. `docs/` was removed in later development; avoid restoring a large
duplicated guide collection. `CHANGELOG.md` is ignored and is not a maintained,
tracked changelog here; do not rely on one being available.

For an authorized release, verify source/package/lockfile versions and the
identity/manifest for each target being shipped. Runtime version display and
update comparison use `package.json`; the standalone `Package.appxmanifest` can
lag and is not proof of the version inside an Electron Builder artifact.
Keep `com.blueysoft.cortana-electron` and the product identity stable unless an
intentional migration is part of the task.

Inspect `package.json`'s explicit `build.files` and `extraResources` whenever
adding runtime files: the packaged app needs `lib/**`, `.winapp/bindings/**`,
assets, `speech.ps1` and `media.ps1` in the expected locations. Source development
success does not establish that packaged asset resolution or native loading works.
Inspect the actual `app.asar`/resources, launch the packaged app with isolated
data, and verify relevant installer/upgrade behaviour without touching a user's
working installation. `--diagnostic-smoke --skip-speech` provides a packaged
initialization probe; omitting `--skip-speech` can open real capture.

The established public download is the NSIS Setup `.exe` plus SHA-256 checksums;
an explicitly selected user demo may also be appropriate. Keep unsigned AppX
builds, internal recordings, profiles and QA reports local. AppX package identity
requires a trusted signing/distribution path for normal installation; the NSIS
build does not supply that identity for supported WinRT dictation. Do not imply
that either packaging or the debug identity helper resolves the known speech
failure. Preserve honest signing and platform-testing limitations.

Before authorized publication, check artifact versions, hashes and provenance
against the reviewed target. When uploading is authorized, verify the resulting
release's tag, notes, visibility, filenames and downloaded checksums. Verify its
user-facing download/update links and watch for reported regressions within the
authorized follow-up scope. Updates currently notify and open a verified newer
stable GitHub release; they do not automatically download/install an update.
There are no tracked CI workflows in this checkout: local reports remain necessary,
and adding automation should serve a demonstrated need.

## Writing, commits and durable context

Write clearly, warmly and concretely. Keep the README and announcements useful to
users: explain what changed for them, retain Cortana's personality, and avoid
corporate filler, inflated claims or invented tests/features. Use technical detail
where it helps developers assess a change. Keep documentation consistent with the
implementation and public release history.

Follow the existing commit style: concise, informative imperative subjects such as
`Fix tour completion tracking on upgrade`, with a body when rationale or validation
needs explanation. Commit only when the session authorizes it, preserving the
maintainer's configured primary Git author identity. When Codex creates or amends
a commit it materially contributed to, include this exact trailer once, separated
from the body by a blank line:

```text
Co-authored-by: Codex <267193182+codex@users.noreply.github.com>
```

This attribution rule applies only to Codex. **If you are not Codex, do not add
the Codex trailer.** Preserve legitimate existing co-author credits, including
Codex credits already present. Do not attribute entirely human work to Codex,
change Git identity to Codex, or rewrite older commits merely to add credit.
Inspect the final message/trailers before committing. Do not amend others'
history, force-push or merge protected branches without authorization.

Finish with what changed, why, what was actually verified and any material limits
or remaining work. Distinguish unit/mocked checks, real Electron checks, packaged
checks and hardware acceptance. Keep build output (`dist/`), dependency folders,
generated bindings and `.verification/` out of commits. Leave useful local
evidence intact. Update this guide when architecture or workflow changes, keeping
temporary status, test counts and large historical narratives elsewhere.
