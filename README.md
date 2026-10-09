# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Features

*   **Voice Search:** Use the microphone for voice commands, with an offline mode for built-in commands. Recognition may fail on affected Windows systems; see the known limitations below. Typed commands remain available.
*   **"Hey Cortana" Wake Word:** Optional, off by default. Opens a slim UI ready for your voice command, even when the app is hidden. Subject to the same recognition limitations as voice search.
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

### Install Cortana

Download the **Setup `.exe` installer** from the [latest release](https://github.com/SoftBluey/Cortana-Electron/releases/latest), run it, and open **Cortana Electron** from the Start Menu. You can also pin it to the taskbar.

Enable **Start with Windows** in Settings to launch quietly in the tray. Disabling Cortana in Windows Startup Apps is respected on later launches.

### Build it yourself

#### Prerequisites

Use Windows and [Node.js](https://nodejs.org/) 22.12 or newer. The tested environment is Windows 11 x64; Windows 10 and ARM64 still need testing.

Edge TTS (the default voice engine) works out of the box with an internet connection. If you prefer offline speech, switch to System TTS in settings and make sure you have at least one speech language installed in Windows.

When Edge speech is unavailable, Cortana temporarily falls back to an installed local voice without changing your saved engine or voice preference. Regular Microsoft Zira is the local default; Zira Desktop is only a fallback if regular Zira is unavailable. An unavailable Eva preference is retained so it can be restored when Windows exposes that voice again. Updates do not install, remove or overwrite voice assets.

#### Installation & Running

1.  **Clone the repo:**
    ```sh
    git clone https://github.com/SoftBluey/Cortana-Electron
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd Cortana-Electron
    ```
3.  **Install NPM packages:**
    ```sh
    npm ci
    ```
4.  **Run the app in development mode:**
    ```sh
    npm start
    ```

### Build the Windows installer

To create the `.exe` installer:

``` sh
npm run dist
```

The installer is saved in `dist`. Development runs do not add Electron to Windows startup; **Start with Windows** is available in the installed app.

### Development checks

```sh
npm run check
npm test
npm run smoke -- --workflows
```

The smoke test checks interface workflows with a temporary profile and saves its results under `.verification`. It does not change your normal settings or Windows startup registration. Microphone actions are simulated.

### Known limitations and troubleshooting

Speech recognition and the listening-related speaker pop remain unresolved on affected Windows systems. The installer does not fix these issues. You can continue using typed commands, Notebook and text-to-speech.

If you run into a speech problem, open **Settings > Troubleshooting > Copy speech diagnostics** and include the details in your report. Diagnostics exclude recognized speech and API keys.

See the [8.0.0 release notes](https://github.com/SoftBluey/Cortana-Electron/releases/tag/v8.0.0) for the major changes and remaining limitations.

### This project is licensed under the GNU General Public License v3.0, see the LICENSE file for details.
