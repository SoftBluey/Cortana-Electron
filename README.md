# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

<img width="378" height="660" alt="Cortana Electron 8.0.0" src="https://github.com/user-attachments/assets/845eca5a-4a70-4358-8837-0a9818e35b58" />

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Install Cortana

Download the **Setup `.exe` installer** from the [latest release](https://github.com/SoftBluey/Cortana-Electron/releases/latest), run it, and open **Cortana Electron** from the Start Menu. You can also pin it to the taskbar.

Enable **Start with Windows** in Settings to launch quietly in the tray. Turning it off in Windows Startup apps keeps it off when Cortana next opens.

This checkout includes unreleased startup and interface fixes. The published installer is still 8.0.0; the fix for re-enabling startup after disabling it in Task Manager will be included in a future release.

### Features

*   **Voice Search:** Use the microphone for voice commands, with an offline mode for built-in commands. Recognition may fail on affected Windows systems; see the known limitations below. Typed commands remain available.
*   **"Hey Cortana" Wake Word:** Optional, off by default. Opens a slim UI ready for your voice command, even when the app is hidden. Subject to the same recognition limitations as voice search.
*   **Edge Neural Text-to-Speech:** High-quality Microsoft Edge Neural voices for natural-sounding responses. System TTS (like Windows Zira) is also available as a fallback.
*   **Embedded Web Search:** DuckDuckGo results appear inside Cortana. The browser search engine in Settings controls searches opened in your browser.
*   **Optional AI replies:** Connect to an OpenAI-compatible provider with your own API key and model, or run a local server such as Ollama or LM Studio. Online providers receive questions that do not match a built-in command.
*   **Notebook:** Keep local notes, tasks and reminders, and tell Cortana what to call you!
*   **Assistant Shortcut:** Configure a global keyboard shortcut in Settings, optionally starting voice recognition. Compatible hardware buttons can be mapped to it through device software.
*   **Background Preference:** Keep Cortana in the notification area for reminders and timers, or choose to quit when dismissed. They need Cortana running.
*   **Built-in Skills:**
    *   **Weather Forecast:** Ask "weather in Chicago" to get current conditions. In this checkout, Settings also lets you choose a default weather city. Weather needs an internet connection.
    *   **Calculator:** Type any simple math equation to get a quick answer.
    *   **Time Lookup:** Ask for the time locally ("What time is it?") or in any major city ("Time in Tokyo"). Supports 12-hour and 24-hour formats.
    *   **Jokes:** Ask Cortana to tell you a joke.
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

Use Windows and [Node.js](https://nodejs.org/) 22.12 or newer. The tested environment is Windows 11 x64; Windows 10 and ARM64 still need testing.

Edge TTS (the default voice engine) works out of the box with an internet connection. If you prefer offline speech, choose Windows (offline) under Settings > Spoken replies and make sure you have at least one speech language installed in Windows.

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
