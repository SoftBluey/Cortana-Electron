# Cortana Electron 8.0.0

This major version combines the maintenance improvements with a simpler, functional interface. Source, lockfile and the Windows manifest are versioned for 8.0.0. Local build verification does not publish a GitHub release.

## Interface

- Notebook now contains Notes, Tasks, Reminders and About me. About me changes the nickname used in greetings. Removed service/permission/tip pages, duplicate reminder categories, setup prose and quick-action links. Existing Notebook contents and old profile fields remain stored; removed interface fields are not erased.
- Notebook and Settings keep their backgrounds and Back buttons stationary while the heading and body enter in short, ordered regions. Switching destinations cancels obsolete animations and keeps focus in the selected view. Interrupted motion continues from the current frame; repeated destination clicks do not replay it. Settings no longer rebuilds its controls during navigation. See the [1607 motion pass](motion-1607.md) for references, timing choices and frame verification.
- Cortana's GIFs are 705 by 822 pixels. Canvas sizing preserves this source ratio rather than forcing Notebook into a square. The Notebook idle orb is larger and uses the shared idle animation and accent tint. Home retains its original idle size; active requests, reminders and other active states retain their smaller size. The reminder form fits below the orb, scrolls when needed and keeps its controls reachable.
- Settings controls wrap inside the space beside the rail. Section headings and back buttons are consistent. Already-installed Eva does not show a redundant installer button. The assistant shortcut section no longer reserves excess space above its input.
- Ordinary speech errors use a short message with Settings and Dismiss actions. Technical statuses are kept in a collapsed Troubleshooting section and the bounded diagnostic log. Console speech tracing is opt-in with `--speech-debug`.
- Original microphone on/off cues are restored. A one-time upgrade migrates the temporary muted troubleshooting default; later choices to mute Listening sounds remain saved. Playback restarts the cue cleanly and handles unavailable audio without breaking the interface.
- Application version display and update comparison read the project's version, including when launched through a development script.
- The temporary `cortana-electron.debug` Windows entry from speech investigation was unregistered, and the original development Electron executable was restored and hash-verified. An optional `identity:remove` helper makes that cleanup repeatable. Production package identity support remains part of the signed distribution path.

## Included maintenance

The final release pass gives the shortcut field a fixed, compact height and paints the greeting before settings, voices and Notebook finish loading. Orb GIFs hold their final frame for its full duration. Repeated idle requests preserve the current animation, and superseded click animations cannot overwrite a newer request. Returning Home uses the authored idle transition.

Start with Windows uses the packaged executable, skips development registration and respects a disabled Windows Startup Apps entry. Changes are checked before confirming they were saved. Store/AppX startup is not yet supported; its toggle indicates that the `.exe` installation is required. The unused preload bridge, obsolete placeholder assets and duplicate speech investigation scripts were removed. The explicit microphone probe and development identity cleanup remain available to maintainers.

Electron 44.7.0, matching dynwinrt/codegen preview.22, winapp CLI 0.7.1 and a reproducible dependency lockfile. The earlier pass added serialized atomic data storage, absent-Eva preference retention, regular Zira defaults, local command routing, configurable assistant shortcuts, local AI endpoint handling, tray/quit preference, validated external links and bounded GIF memory/work. See the [issue and performance report](maintenance-2026-10-08.md) for the original measurements and partial issue acceptance limits.

## Verification

- 40 unit tests passed; syntax checks passed for 22 JavaScript files.
- All 22 real-renderer workflows passed in each of the classic and movable window modes. Screenshots were reviewed for Settings, Notebook, Home and the reminder form. Orb checks cover Home, reminder creation/list, an active timer, result layout and Notebook, including the requirement that active states remain smaller than idle.
- The motion-specific checks passed in both window modes, including interrupted navigation, repeated clicks, overlay hit areas and reduced motion. Frame samples measured zero movement of the Settings pane, Back button and rail icons, compared with 18 pixels of pane/Back movement before this pass.
- The dependency audit reported zero known vulnerabilities.
- Both Windows x64 builds completed: `dist/Cortana Electron Setup 8.0.0.exe` and `dist/Cortana Electron 8.0.0.appx`. The packaged application archive was checked for version 8.0.0 and the final orb sizes.
- The packaged executable started successfully with `--diagnostic-smoke --skip-speech`: renderer and Notebook initialized, WinRT bindings loaded, and no diagnostic errors were reported. Capture was not opened.

Microphone recognition troubleshooting is paused at the user's request. UI cue tests intercept recognition requests and use a disposable profile; they verify playback requests without starting actual capture. They do not prove audible cue playback or speech recognition on the user's hardware. The verification outputs and screenshots are stored locally under `.verification`.

## Known limits

The reported WinRT dictation failure and physical speaker pop are unresolved; this version does not claim a speech-engine fix. No fallback recognition engine was added. Existing WinRT and TTS options remain available. See the [speech investigation](1607-notebook-and-speech-followup.md).

Production AppX needs trusted signing or Microsoft Store distribution to provide package identity without Developer Mode. The local artifacts are unsigned. NSIS retains typed functionality but does not register package identity for supported WinRT dictation. Developer Mode is only needed for the optional source-development identity helper. Windows 10, ARM64, Bluetooth headset buttons and Intel rendering still need acceptance testing. No issue was closed. The GitHub release remains a draft pending distribution and hardware acceptance.
