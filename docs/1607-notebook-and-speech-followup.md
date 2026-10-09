# Speech and original Cortana follow-up — October 8, 2026

**Historical investigation and interim interface.** The [8.0.0 release notes](release-8.0.0.md) supersede the interface, version, sound-default and release-validation details below. Recognition troubleshooting is currently paused at the user's request; the speech evidence below is retained.

Work remains local at version 7.2.1. No release has been published. The interface and lifecycle fixes are implemented; physical speech recognition and the listening-related speaker pop remain unresolved.

## Speech evidence and conclusion

| Comparison | Result |
| --- | --- |
| Real speech, default NVIDIA Broadcast, online WinRT continuous dictation | Windows completes with UserCanceled (5), empty output; app had not requested cancellation |
| Real speech, WinRT built-in commands | Times out without words; user still hears a pop |
| Temporary G733 default, all capture roles | Same timeout and pop; microphone unmuted |
| Debug package identity and microphone capability | Present; did not fix real spoken dictation |
| Synthetic “what time is it,” explicit VB-CABLE playback and a fresh app process, offline WinRT grammar | Success, High confidence, exact phrase matched |
| Same synthetic input and fresh process, online WinRT dictation | UserCanceled (5), no final utterance |

The synthetic route was verified separately through Chromium capture (peak amplitude 0.924). That capture was released before WinRT recognition began. Only playback to the installed virtual cable was used; physical output defaults were untouched. Previous capture defaults were restored. Test artifacts are in `.verification/loopback-commands.json` and `loopback-dictation.json`; no human audio or transcripts were saved. This confirms a usable offline WinRT recognition path and separates the online failure from a universally broken app binding. It does not prove accurate physical-microphone recognition or explain the speaker pop.

The user reports an independent, dependency-free PowerShell `RecognizeAsync()` repro returning Unknown, empty text and Rejected confidence. They report the same failure after a clean Windows reinstall and after checking consent, language packs, enhancements, exclusive mode, default microphone, Voice Access and system integrity. They also report Win+H and other applications remain functional. The reported onset correlates with the August 15 updates KB5121003 / KB5123304 / KB5120708 / KB5054156. That history strongly favors an upstream WinRT dictation regression; the specific update or service responsible is **not established**. We did not repeat those invasive troubleshooting steps or remove updates/drivers.

Read-only CoreAudio inspection reports NVIDIA Broadcast at 0% and unmuted, while G733 reports about 94% and unmuted. A virtual endpoint's reported gain is not proof of silent audio. The earlier physical G733 test reused an existing process; a fresh-process G733 retest is a bounded next check if desired, since cached routing remains possible. HP w2408 currently appears as an active output endpoint, although the user described it as disabled. Its state was not changed during this investigation. No claim is made about which endpoint produced the pop.

Changes: WinRT-only recognition, explicit online/offline mode, continuous manual sessions, bounded operations, serialized release before TTS, suppression of late results, no cancellation merely from input focus/blur, and input-device change filtering. Wake failures stop retrying after three attempts. Listening sounds default off. A wrapped error panel provides speech Settings and dismiss controls. Diagnostics include package identity, capture defaults, gain/mute, status codes and stages, excluding keys and recognized text. Regular Zira is preferred over Zira Desktop.

## Package identity and distribution

Microsoft's current [continuous dictation documentation](https://learn.microsoft.com/en-us/windows/apps/develop/input/enable-continuous-dictation) requires MSIX package identity. This was corrected after the first-pass report. Inbox WinRT speech does not require a Windows App SDK runtime dependency.

`npm run identity:dev` embeds and registers a sparse debug identity only. The helper avoids the current winapp debug generator's capability-ordering and unnecessary runtime-dependency problems. It increments the debug package version for re-registration and maintains a version-matched Electron backup. The user enabled Developer Mode manually; the helper does not change that setting.

`npm run dist:msix` builds the existing Electron Builder AppX format, with microphone and internet capabilities. Production uses a trusted signed package or Microsoft Store installation; consumers do not need Developer Mode. Local unsigned AppX output still needs release signing. The NSIS installer remains unpackaged and does not yet register signed sparse identity. A future NSIS identity option should follow Microsoft's [sparse package distribution guidance](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/sparse), rather than requiring customers to use a development setup.

## What Notebook did in 1607

The September 2016 UI inspection documents About me (name and favorite places), Reminders, connected accounts and permissions. Connected services included Office 365, LinkedIn, Uber, Xbox Live, Dynamics CRM and Microsoft Health. Permissions controlled location, communications/contact/calendar access and browsing history. Quiet Hours was phone-specific. [Contemporary Notebook walkthrough](https://www.windowscentral.com/how-use-cortanas-notebook-windows-10).

Interest cards controlled Home feed content, preferences and notifications: Academic, Cortana tips, Eat & drink, Events, Finance, Getting around, Health & fitness, Meetings & reminders, Movies & TV, News, On the Go, Packages, Reservations, Shopping, Special days, Sports, Travel and Weather. [Contemporary interest-card walkthrough and screenshots](https://www.windowscentral.com/how-configure-interest-cards-cortanas-notebook-windows-10).

The Anniversary Update also added lock-screen assistance, photo reminders and cross-device notifications. [Microsoft's 1607 announcement](https://blogs.windows.com/windowsexperience/2016/06/29/windows-10-anniversary-update-available-august-2/). Wunderlist-backed list improvements were described later in November 2016, so local lists here are a practical extension rather than a claim about the initial 1607 feature set. [Microsoft's later list update](https://blogs.windows.com/windowsexperience/2016/11/28/windows-10-tip-three-ways-cortana-can-help-holiday/).

The recreation now provides a persistent 48-pixel rail, expandable labels, Home/Notebook navigation and bottom About me/Settings/Feedback. The Notebook directory opens functional profile/favorite-place, weather, local note/list and reminder pages, plus permissions and provider settings. Retired Microsoft integrations are not impersonated. The introductory miniature uses the same AnimationManager, idle GIF sequence, cache and accent tint as the main assistant, including visibility/focus suspension. Page transitions respect reduced motion. Back/Escape navigation and keyboard focus are integrated. Settings gear alignment and narrow dropdown/control layouts are corrected.

## Lightweight alternatives to investigate

No alternative has been installed or made the default. Vosk small US English is the first candidate for a local streaming command/wake prototype: a 40 MB Apache-2.0 model with configurable vocabulary; upstream estimates roughly 300 MB runtime memory for small models. These are upstream figures, not measurements on this PC. [Vosk model documentation](https://alphacephei.com/vosk/models).

For broader dictation, whisper.cpp supports Windows and CPU inference; tiny uses about 75 MiB disk and 273 MB memory in the upstream table, with quantization available. Actual latency, accuracy, silence hallucinations and packaging need measurement. It would be loaded on demand rather than run continuously for wake detection. [whisper.cpp documentation](https://github.com/ggml-org/whisper.cpp).

Any prototype should use a bundled native helper or worker, bounded threads, an optional verified model download and direct capture independent of WinRT speech. Acceptance must include Broadcast and G733, short commands and free speech, sustained idle cost, cancellation/TTS overlap and speaker-pop checks. Neither candidate is a proven replacement on this hardware yet.

## Release validation and remaining work

Electron is 44.7.0; dynwinrt/codegen remain matching preview.22. The lockfile removes the vulnerable transitive sprintf dependency through a compatible global-agent override. npm audit reports zero advisories; this is not a complete application security audit. Renderer Node integration remains a security-hardening follow-up; external URLs and provider endpoints are validated, and a content security policy is in place.

The major-release gate remains successful real speech or an accepted replacement, resolution/mitigation of the physical pop, trusted package signing and installation acceptance, plus Windows 10/ARM64 testing. Startup and UI tests do not substitute for these checks. Existing user settings, Eva preference and installed voices are preserved.

Latest checks: 31 automated tests pass; syntax checks cover 20 JavaScript files; 18 real-renderer workflows pass in both movable and classic layouts with no unexpected console errors. These include wrapped/dismissible speech feedback, Settings navigation, silent capture indicators, note/list command routing, narrow controls and shared animation tint/lifecycle. Screenshot review additionally corrected excessive spacing in the Eva and AI prompt sections and moved focus to the Settings back button. The sparse development setup was rerun successfully without removing the installed debug package. Audit metadata records zero advisories across 282 dependencies. Earlier idle measurements in the maintenance report are historical Electron 43 baseline comparisons, not new Electron 44 benchmark claims.

Both current x64 builds completed: `dist/Cortana Electron 7.2.1.appx` and `dist/Cortana Electron Setup 7.2.1.exe`, unsigned. The unpacked production executable's disposable diagnostic passed with Electron 44.7.0: renderer initialized, WinRT binding loaded, local grammar compiled, and microphone start/cancel completed. As expected for unpackaged execution, package identity was false. This is a startup/lifecycle check, not spoken dictation or signed AppX installation acceptance.

Next checklist:

- [ ] One fresh-process physical G733 offline-command retest when the user returns; compare with the successful synthetic route. Stop repeating privacy/language/reset tests already ruled out.
- [ ] Prototype and measure Vosk small US English only if WinRT physical recognition remains unusable; evaluate whisper.cpp for broader dictation. Preserve explicit engine choice and existing TTS.
- [ ] Test capture transitions for the HP monitor pop on real hardware; avoid repeated automatic reopening and do not change drivers or endpoint state without a concrete finding.
- [ ] Sign and test AppX install/update from a standard user account with Developer Mode off. Add signed sparse identity to NSIS if retaining that installer as a supported voice distribution.
- [ ] Verify Windows 10, ARM64, Bluetooth assistant hardware and licensed Eva installation/update behavior. Complete rendering checks on Intel hardware for issue #20.
- [ ] Choose a major release version and publish only after the remaining acceptance checks; no GitHub issue was closed by this pass.
