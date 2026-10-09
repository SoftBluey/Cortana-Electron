# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Features

*   **Voice Search:** WinRT online dictation or an explicit offline mode for built-in commands. Final words auto-submit after the microphone is released. Speech errors appear above the search bar with a Settings shortcut. Recognition currently fails on the reported Windows 11 installation; see the [speech investigation](docs/1607-notebook-and-speech-followup.md). No older speech API is used as a fallback.
*   **"Hey Cortana" Wake Word:** Optional, off by default. Say "Hey Cortana" anytime and a slim UI pops up ready for your voice command. Works even when the app is hidden.
*   **Edge Neural Text-to-Speech:** High-quality Microsoft Edge Neural voices for natural-sounding responses. System TTS (like Windows Zira) is also available as a fallback.
*   **Embedded Web Search:** Search results are fetched and displayed right inside the app in a clean dark-themed list. No need to leave the conversation.
*   **ChatGPT / AI Integration:** Connect to any OpenAI-compatible API for intelligent responses. Set your own API key, model, and system prompt.
*   **Notebook:** Local notes, tasks and reminders, plus a nickname used in Cortana's greeting. The classic rail and miniature Cortana share the main assistant's animation and accent color. Settings has a consistent transition without overlapping pages.
*   **Assistant Shortcut:** Configure a global keyboard shortcut in Settings, optionally starting voice recognition. Compatible hardware buttons can be mapped to it through device software.
*   **Background Preference:** Keep Cortana in the tray for reminders, or choose to quit when dismissed.
*   **Built-in Skills:**
    *   **Weather Forecast:** Ask "weather in (City name!)" to get current conditions.
    *   **Calculator:** Type any simple math equation to get a quick answer.
    *   **Time Lookup:** Ask for the time locally ("What time is it?") or in any major city ("Time in Tokyo"). Supports 12-hour and 24-hour formats.
    *   **Jokes:** 54 dad jokes and counting.
    *   **Reminders:** Cortana can remind you to do things.
    *   **More:** Cortana can launch applications, tell you the day, and give you a drumroll!

### Built With

*   [Electron](https://www.electronjs.org/)
*   [@microsoft/dynwinrt](https://www.npmjs.com/package/@microsoft/dynwinrt) - Native WinRT speech recognition
*   [node-edge-tts](https://www.npmjs.com/package/node-edge-tts)
*   HTML5
*   CSS3
*   Vanilla JavaScript

---

### Build it yourself

#### Prerequisites

Use Windows 10/11 on x64 or ARM64 and a supported [Node.js](https://nodejs.org/) installation (Node 22.12 or newer for the build tools). The tested environment is Windows 11 x64, Node 26 for development, and Electron 44.7.0 with embedded Node 24.21.0. Windows 10 and ARM64 runtime behavior still require hardware validation.

Edge TTS (the default voice engine) works out of the box with an internet connection. If you prefer offline speech, switch to System TTS in settings and make sure you have at least one speech language installed in Windows.

When Edge speech is unavailable, Cortana temporarily falls back to an installed local voice without changing your saved engine or voice preference. Regular Microsoft Zira is the local default; Zira Desktop is only a fallback if regular Zira is unavailable. An unavailable Eva preference is retained so it can be restored when Windows exposes that voice again. Updates do not install, remove or overwrite voice assets.

#### Installation & Running

1.  **Clone the repo:**
    ```sh
    git clone https://github.com/SoftBluey/Cortana-Electron
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd cortana-electron
    ```
3.  **Install NPM packages:**
    ```sh
    npm install
    ```
4.  **Run the app in development mode:**
    ```sh
    npm start
    ```

For WinRT speech development, enable Windows Developer Mode yourself and run `npm run identity:dev` once after installing or updating Electron. This registers a development package identity with microphone capability. It does not enable Developer Mode, trust certificates or modify audio devices. Normal users receive identity through a signed release package and do not need Developer Mode. Microsoft's [WinRT dictation guide](https://learn.microsoft.com/en-us/windows/apps/develop/input/enable-continuous-dictation) requires package identity; identity alone does not fix the reported Windows speech regression.

This development identity is optional and is never registered by normal startup or the NSIS installer. To remove its temporary Windows entry, quit development Cortana from its tray and run `npm run identity:remove`. The cleanup removes only this workspace's `cortana-electron.debug` package and restores its version-matched original Electron executable. It does not change Developer Mode or audio devices.

### Building for Distribution

For the Windows package with identity needed by WinRT speech, build:

```sh
npm run dist:msix
```

This creates an AppX package. A public release must be signed with a trusted publisher certificate or distributed through the Microsoft Store. The unsigned local build is a verification artifact, not a ready-to-install public release. Normal signed installation does not require Developer Mode.

The existing `.exe` installer remains available:

``` sh
npm run dist
```

The NSIS installer creates a Start Menu shortcut named **Cortana Electron**. Find it by typing that name into Windows Search, or pin it to the taskbar. This provides convenient access without modifying Windows Search.

**Start with Windows** uses the packaged `.exe` and opens Cortana quietly in the tray. Turning Cortana off in Windows Startup Apps is respected on later launches. Source-development runs do not register Electron at login. The startup toggle is unavailable in source runs and Store/AppX builds; use the `.exe` installation for this option.

NSIS currently does not register package identity. Typed commands, Notebook and TTS remain available; do not advertise this installer as providing supported WinRT dictation until signed identity registration is integrated.

### Validation and troubleshooting

```sh
npm run check
npm test
npm run smoke -- --workflows
npx electron scripts/motion-smoke.cjs --classic
npx electron scripts/motion-smoke.cjs
npx electron scripts/opening-smoke.cjs
```

The smoke test uses a disposable profile under `.verification` and skips Windows startup registration. It checks the real renderer and IPC workflows, writes screenshots and performance samples, then exits.

To record the real UI workflow tests as a captioned demonstration, install FFmpeg separately and run `npm run smoke -- --workflows --classic --quick --record --label=cortana-8-smoke-demo`. Recording captures only the app's complete rendered view, without the desktop or audio. Tests use dummy data and pause for readability. The video labels simulated microphone checks and does not claim that live recognition works. Output is an MP4 and subtitle file under `.verification`; recording does not add a production dependency. Performance samples from a recording run are not comparable with ordinary smoke runs.

For a brief default-microphone test without saving audio or transcripts:

```sh
npx electron scripts/probe-winrt.cjs
npx electron scripts/probe-winrt.cjs --commands
```

For a read-only inventory of default audio routes, input volume and mute state, use `powershell.exe -NoProfile -File speech.ps1 -Inventory`. This does not open an audio stream or alter device settings. Version 8 restores the classic microphone on/off cues once after the muted troubleshooting build. Later choices to mute Listening sounds in Settings are preserved.

The packaged executable also accepts `--diagnostic-smoke`. It uses a new temporary profile, tests startup and local microphone start/cancel, writes `smoke-result.json` in that profile, and quits. Add `--skip-speech` to verify startup without opening the microphone. Without that flag, it briefly activates the default microphone. Do not use these arguments for a normal launch.

For normal-use failures, expand **Settings > Troubleshooting > Copy speech diagnostics**. Technical details stay out of normal error messages. Logs include OS/architecture, Electron/Node versions, speech stages and HRESULT values. They exclude recognized text and API keys. The rotating `speech-diagnostics.jsonl` log is stored with your application settings; copied diagnostics include its path. Use `--speech-debug` only when console speech-stage output is needed.

See [the version 8 release notes](docs/release-8.0.0.md), [the speech investigation](docs/1607-notebook-and-speech-followup.md) and [the earlier maintenance report](docs/maintenance-2026-10-08.md) for issue status, measured performance, compatibility limits and remaining physical-device checks.

### This project is licensed under the GNU General Public License v3.0, see the LICENSE file for details.
