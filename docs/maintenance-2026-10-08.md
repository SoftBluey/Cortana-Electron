# Cortana Electron maintenance — October 8, 2026

**Historical first-pass report.** The [speech and 1607 follow-up](1607-notebook-and-speech-followup.md) supersedes this report's speech, identity, dependency and validation sections. Current recognition is WinRT only; SAPI recognition was removed, Electron is 44.7.0, npm audit reports zero advisories, and actual hardware speech tests failed. Successful start/cancel checks below never established successful transcription. The earlier performance measurements remain baseline comparisons on this machine.

For the current simplified interface and version, see the [8.0.0 release notes](release-8.0.0.md).

The application remains version **7.2.1**. This pass preserves the classic visuals, voice engines, animations, custom actions and reminders. Work is local; no release was published and no GitHub issue was closed.

## Issue audit and resulting behavior

All six open issues and their complete comment threads were reviewed through GitHub's API on October 8, 2026. There were no additional open issues beyond these six.

| Issue | Finding and implementation | Status |
| --- | --- | --- |
| [#6](https://github.com/SoftBluey/Cortana-Electron/issues/6) | Existing Start Menu access is retained and made explicit in NSIS configuration. Search for Cortana Electron or pin its shortcut. Eva availability and preferences are retained; no Microsoft voice assets are redistributed by this change. | Partially addressed. Embedding/replacing Windows Search and reproducing the original hybrid recorded voice are not implemented. |
| [#10](https://github.com/SoftBluey/Cortana-Electron/issues/10) | Configurable global shortcut, optional listening on activation, conflict feedback and rollback to the previous registration. Empty input disables the shortcut. | Shortcut implemented and tested. Direct Jabra assistant-button integration is not implemented or hardware-tested. |
| [#11](https://github.com/SoftBluey/Cortana-Electron/issues/11) | Functional classic Notebook sidebar and a getting-started card. Missing Eva no longer overwrites the preferred voice when Chromium refreshes its voice list. | Implemented; persistence and sidebar workflows tested. Actual Eva installation/update acceptance requires an installed, licensed Eva voice. |
| [#15](https://github.com/SoftBluey/Cortana-Electron/issues/15) | Local notes and to-dos, upcoming reminder editing/deletion/creation, folder/timer/settings quick actions, Escape navigation, keyboard focus and clear save feedback. Existing reminder scheduling is reused. | Implemented and tested in movable and classic windows. This is an application sidebar, not an OS Action Center replacement. |
| [#20](https://github.com/SoftBluey/Cortana-Electron/issues/20) | Local commands already preceded AI. Added local known-folder commands and Notebook access, skipped web suggestions for recognized local commands, removed the offline-only AI restriction for loopback servers, and added local TTS fallback. Removed unnecessary text compositing transforms and persistent `will-change`. | Offline improvements implemented and tested. Intel/MSAA blur was investigated but not reproduced on available NVIDIA hardware; rendering changes are a partial mitigation. |
| [#21](https://github.com/SoftBluey/Cortana-Electron/issues/21) | Pause GIF work while hidden, unfocused or covered by settings/Notebook. Single-frame GIFs stop scheduling timers. Monochrome frames use one intensity byte instead of four RGBA bytes; tinting uses a precomputed palette; cache is bounded by count and bytes. | Implemented with measured improvement on this machine. Longer performance testing remains useful. |

## Speech reliability and hardware findings

Speech lifecycle management now lives in `lib/speech-controller.js`, with a single owner for microphone resources. Generation tokens and AbortSignals reject stale results. Native compilation/recognition/start/stop calls have time limits. Wake subscriptions are removed during cleanup. SAPI process termination is awaited before another capture or TTS begins.

WinRT dictation is an online Windows speech feature. Manual recognition falls back to local SAPI when consent is disabled or WinRT fails. A recoverable WinRT error no longer sends a terminal UI error that cancels the fallback. SAPI now runs one bounded recognition request, disposes its recognizer and exits; it no longer loops forever after returning a result. Its diagnostics include engine, language, initialization stage and HRESULT.

Wake recognition uses a local list grammar for **Hey Cortana / Cortana**, instead of continuous cloud dictation. TTS first awaits capture cleanup and suspends wake listening until playback ends. Recognition is recreated after device changes/resume. Synthesis alone never creates a recognizer. Slow Edge synthesis results cannot start playback after cancellation; Edge/network failures use a temporary local voice. These fallbacks preserve saved settings.

The runtime explicitly initializes the main thread's COM apartment before loading generated classes. It accepts an already initialized compatible apartment rather than assuming Node initialized WinRT. This app uses inbox `Windows.Media.SpeechRecognition` APIs and does not require `initWinappsdk()` merely to use speech.

Read-only environment inspection found Windows 11 Pro **10.0.26300**, x64, NVIDIA RTX 3070, plus virtual display adapters and several physical/virtual audio endpoints (G733, Realtek, Virtual Desktop, NVIDIA Broadcast and VB-Audio). Windows reported microphone permission **granted**. The installed local SAPI recognizer is **MS-1033-80-DESK**, language **en-US**. No device, driver, permission or voice installation was changed.

| Physical-machine check | Result |
| --- | --- |
| WinRT native module load and COM initialization | Passed in development and packaged x64 executable |
| WinRT recognizer activation, current language | Passed; en-US |
| Local wake grammar compilation | Passed; Success (0) |
| Continuous microphone start, cancellation, close and fresh initialization | Passed |
| WinRT dictation compilation | Passed; Success (0) |
| Dictation AbortSignal cancellation | Passed; expected AbortError, no transcript saved |
| Local SAPI microphone/grammar initialization and one-second diagnostic recognition | Passed; no speech detected in the unattended sample |
| Actual spoken transcription accuracy | Not tested with a deliberate spoken phrase |
| Bluetooth playback quality with wake on/off | Not tested; no Jabra/Bluetooth playback acceptance claim |
| Physical default-device switching and sleep/resume | Lifecycle covered in code; physical transitions not exercised |
| Windows 10 and ARM64 | Not hardware-tested |

These checks did **not** reproduce an activation or microphone-initialization fault. They do not prove the original hardware problem is resolved. Both x64 and ARM64 native prebuilds are supplied by dynwinrt; its Node-API binding is distinct from traditional Electron module ABI rebuilding. Only x64 packaging and execution were validated here. The APPX manifest's microphone capability is retained; NSIS is an unpackaged desktop application and uses Windows desktop-app microphone permissions.

## Additional reports from #6

- **Ollama:** Root, `/v1` and complete chat-completion endpoints already had some normalization. The implementation now preserves compatible versioned paths, requests non-streaming JSON explicitly, decodes UTF-8 safely, rejects embedded URL credentials, handles disconnected/oversized/timed-out responses, and explains connection refusal for a local server. A loopback mock verified the real request path/body for `phi3:mini` and a Unicode response. An actual Ollama model was not installed or run; the historical invalid-response report was not reproduced against a real model.
- **Bluetooth microphone activation during TTS:** Capture ownership is released before speaking, and wake capture resumes afterward. Cancellation and late synthesis races have regression coverage. Bluetooth audio quality still needs device testing.
- **Close completely:** “Keep running when dismissed” defaults on to preserve existing behavior. Turning it off quits on dismissal/window close. Settings warns that reminders, timers and the hotkey stop until relaunch. Startup registration remains separately configurable.
- **Eva disappearing on updates:** Voice assets were already separate from the application. A real selection-overwrite bug was fixed; absent preferences now survive refreshes and process restart. Detection respects the Windows installation directory and bounds the registry probe. The existing optional installer link is retained; use only assets you are licensed to install.
- **Original recorded responses:** The discussion described the original hybrid voice. No recordings were acquired or redistributed; this is outside the implemented pass.

## Dependency decisions

Versions were checked against npm/NuGet during this pass. No stable dynwinrt release is published; preview.22 is the current npm latest tag, so it is explicitly a preview dependency.

| Component | Previous declared version | Result |
| --- | --- | --- |
| `@microsoft/dynwinrt` | 0.1.0-preview.21 | **0.1.0-preview.22**, exact pin |
| `@microsoft/dynwinrt-codegen` | 0.1.0-preview.21 | **0.1.0-preview.22**, matching exact pin |
| `@microsoft/winappcli` | ^0.5.0 | **0.7.1**, exact pin |
| Electron | ^43.2.0 | **43.7.9**, latest 43 patch; latest 44.7.0 major intentionally not adopted |
| node-abi override | 4.0.0 | **4.37.0**; the old override could not identify Electron 43.7.9's ABI. Build Node minimum is now explicitly 22.12.0. |
| electron-builder | ^26.15.7 | Lockfile resolves **26.17.0** after compatible audit maintenance |
| node-edge-tts | ^1.2.10 | **1.2.10**, current published version; retained |
| city-timezones / gifuct-js | ^1.3.1 / ^2.1.2 | Lockfile resolves **1.3.4 / 2.1.2**; retained |
| Microsoft.Windows.CppWinRT | 3.0.260715.1 | **3.0.260818.1** |
| Microsoft.Windows.SDK.CPP, .x64, .arm64 | 10.0.28000.2526 | **10.0.28000.2705**, matched versions |
| Microsoft.Windows.ImplementationLibrary | 1.0.260126.7 | **1.0.260126.7**, current stable; retained |
| Microsoft.WindowsAppSDK | 2.3.1 | **2.3.1**, retained. NuGet has 2.5.1, but the application does not use its runtime APIs for speech; installing a new global runtime is not needed for this fix. |

Bindings regenerate when the runtime/generator/CLI versions or generation inputs change. Previously `prestart` checked only whether `index.js` existed, so old generated bindings could survive a dependency update. The lockfile is now tracked for reproducible installations. No new application dependency was added.

`npm audit --omit=dev` reports **0 vulnerabilities**. The full audit reports **8 moderate, 0 high/critical** advisories remaining in the build tool chain, rooted in `sprintf-js` through `roarr`, `global-agent` and electron-builder's downloader. The suggested forced change would replace the builder with an older version; it was not applied. Runtime packages are unaffected by that chain. Installer signing was skipped because no signing certificate is configured.

## Measurements

The real app was launched with disposable settings, wake off, System TTS and a movable window. Electron process metrics were sampled once a second for ten seconds per state after a six-second startup wait. CPU figures below average samples 3–10 across app processes. Memory is the final sum of working-set KB converted to MiB; it includes Chromium/GPU processes and is not just retained JavaScript heap.

| State | Before | After optimized tinting |
| --- | --- | --- |
| Visible idle CPU | 2.125% | **0.056%** |
| Visible working set | 1501.8 MiB | **827.7 MiB** |
| Hidden idle CPU | 0.050% | **0.083%** |
| Hidden working set | 1249.5 MiB | **763.9 MiB** |

Hidden CPU was already low because Chromium throttled it. The small hidden-CPU difference is noise/background work, not evidence of an improvement. The new hidden renderer has **no GIF timer scheduled**, while the baseline did. Visible CPU and memory improvements are substantial in these short local samples; they are not universal guarantees. The baseline app code used the same updated Electron binary, helping isolate the animation changes.

Local evidence is under ignored `.verification`: `before.json`, `optimized.json`, `final.json`, `restart.json`, screenshots and `speech-hardware.json`. These profiles never read the user's normal settings or register Windows startup entries. A separate packaged diagnostic profile under the Windows temp directory confirmed the real executable's behavior.

## Smaller fixes and safeguards

- Ordered atomic settings/reminder/Notebook writes prevent older asynchronous snapshots from replacing newer data.
- Missing voices use a temporary fallback and remain saved as the preferred selection.
- Movable-mode relaunch waits for settings persistence and follows normal cleanup rather than abruptly exiting.
- Corrupt/unreadable settings are retained if a backup cannot be made. Unreadable/corrupt reminders are not overwritten at shutdown.
- Due reminders loaded at startup are delivered rather than silently discarded as “not future.”
- Reset All Settings now actually restores defaults; it previously only cleared custom actions.
- Generic typed app names are no longer passed to `cmd /c start`. Known utilities use an allowlist, discovered Start Menu shortcuts use their stored paths, and executable-name fallback uses `spawn` without a shell. Explicit user-configured custom command sequences remain available.
- Fixed the missing base `ms-settings:` allowlist entry and AutoPlay casing.
- Recognition error text remains visible after UI cleanup. The microphone button supports keyboard activation.
- External window navigation is denied; external HTTP(S) links open through the system browser. The unused preload bridge is no longer loaded into a renderer that does not have context isolation enabled.

## Validation performed

| Check | Result |
| --- | --- |
| `npm test` | **22 passed, 0 failed**: capture ownership, cancellation, late results, wake/manual startup races, SAPI fallback, wake unsubscribe/shutdown, timeout/HRESULT handling, atomic storage, Notebook validation, endpoint normalization, offline weather and animation rendering/timing |
| `npm run check` | JavaScript syntax checks passed; this vanilla-JS project has no pre-existing linter or type checker |
| Real Electron smoke workflows | **11 checks passed**: Notebook CRUD, reminder editing/deletion, retained Eva preference, cancelled late Edge TTS, shortcut registration/conflict/disable, compatible AI HTTP request, offline routing and diagnostics/settings |
| Second process launch | Notes and missing Eva preference persisted |
| Dismissal with close-to-tray off | Real app exited successfully and released hotkeys |
| WinApp restore/code generation | Passed with matching preview.22 generation |
| Windows x64 unpacked build and NSIS installer | Built successfully; unsigned |
| Packaged executable diagnostic smoke | Startup, renderer, WinRT loading, local compilation and microphone start/cancel passed |
| Development WinRT/SAPI probes | Passed as detailed above |
| Production dependency audit | 0 vulnerabilities |
| Visual checks | Classic Cortana appearance and Notebook screenshots inspected; NVIDIA only |

No installer was installed over the existing application. Therefore installer upgrade/rollback, actual Windows Search indexing and a real Eva update remain acceptance checks, not verified outcomes.

## Exact remaining checklist

1. **Live speech and hardware:** With wake off, speak “what time is it,” cancel a second request, then retry. Repeat with wake on; ensure Cortana does not hear its own TTS. Repeat with your preferred physical microphone and after changing the default input. Exercise sleep/resume. Capture Settings > Copy speech diagnostics immediately after any failure.
2. **Bluetooth:** Play music on the affected Bluetooth headset, choose System TTS, keep wake off and ask a typed local question. Confirm the Windows microphone indicator stays off during TTS and playback quality stays stable. Repeat with Edge and wake enabled; capture diagnostics plus the exact headset/connection mode if quality changes.
3. **Jabra:** Check whether the model/firmware/device software can emit a keyboard shortcut. Map it to the configured Cortana shortcut and test with Cortana hidden. A hardware button that only invokes a phone/OS assistant cannot be assumed remappable. No raw HID driver/interceptor has been added.
4. **Text:** Compare 100%, 125%, 150%, 175% and 200% scaling on Intel, AMD and NVIDIA; include mixed-DPI monitors. Inspect search results and settings after transitions finish. Record Windows scale, monitor native resolution, graphics-driver forced AA/MSAA settings and screenshots if blur remains. Hardware acceleration and Windows ClearType settings were not changed.
5. **Ollama:** Run your real server/model, select the Ollama preset and `phi3:mini`, test both root and `/v1` URLs with no key, then repeat without internet. Supply the returned error, HTTP status and server log if it fails; never include API keys.
6. **Upgrade and voices:** Back up a test installation's profile, update with the installer, and confirm Eva/local/Edge preference, notes, to-dos, custom actions and reminders. NSIS is configured to retain app data; the user's current installation was not replaced for this test.
7. **Platform matrix:** Run the included smoke and speech diagnostics on Windows 10 and Windows ARM64. Build ARM64 explicitly before claiming native ARM compatibility.
8. **Build tool advisories:** Adopt a compatible upstream fix for the remaining downloader/formatting advisory chain when available. Context isolation remains a separate security migration because the existing renderer depends on Node filesystem/GIF/network helpers.

Deeper Windows Search interception, full OS assistant registration, original recorded response redistribution and a direct Jabra integration remain outside the implemented result. No supported public Windows Search replacement hook was established in this investigation; that is a limitation of the investigated approach, not a claim that every possible third-party method is impossible.

## Primary references checked

- [Microsoft speech recognition and privacy requirements](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition)
- [Microsoft continuous speech session lifecycle](https://learn.microsoft.com/en-us/windows/apps/develop/input/enable-continuous-dictation)
- [Microsoft dynwinrt runtime and initialization](https://github.com/microsoft/dynwinrt)
- [Electron globalShortcut and registration failures](https://www.electronjs.org/docs/latest/api/global-shortcut/)
- [Ollama OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility)
- [NSIS shortcut configuration](https://www.electron.build/nsis/)
- [Windows ConversationalAgent API surface](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.conversationalagent?view=winrt-26100)

The API documentation establishes available surfaces and requirements. It does not establish acceptance on an untested headset, GPU, OS version or licensed voice installation.
