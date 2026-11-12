# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

<img width="378" height="660" alt="Cortana Electron" src="https://github.com/user-attachments/assets/845eca5a-4a70-4358-8837-0a9818e35b58" />

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Install Cortana

Download the **Setup `.exe` installer** from the [latest release](https://github.com/SoftBluey/Cortana-Electron/releases/latest), run it, and open **Cortana Electron** from the Start Menu. You can also pin it to the taskbar.

Enable **Start with Windows** in Settings to launch quietly in the tray. Turning it off in Windows Startup apps keeps it off when Cortana next opens.

**8.1.0** adds a welcome tour, named lists, repeating reminders, timers that survive a restart, My day, Windows media controls, and smoother animations and startup.

**8.1.1** restores Edge spoken replies, lets you record an assistant shortcut by pressing its keys, and improves timer commands. Online speech recognition remains unreliable on affected Windows 11 systems.

### Features

*   **Welcome tour:** See what Cortana can do when you first install her or upgrade from 8.0.0. You can add an optional name and weather city, or skip it. Finishing or skipping is remembered across restarts and preference resets, including upgrades from earlier test builds. Your existing settings, notes, lists and reminders are kept. Replay it from Settings > System > Take a tour.
*   **Voice Search:** Use the microphone for voice commands, with an offline mode for built-in commands. Recognition may fail on affected Windows systems; see the known limitations below. Typed commands remain available.
*   **"Hey Cortana" Wake Word:** Optional, off by default. Opens a slim UI ready for your voice command, even when the app is hidden. Subject to the same recognition limitations as voice search.
*   **Edge Neural Text-to-Speech:** High-quality Microsoft Edge Neural voices for natural-sounding responses. System TTS (like Windows Zira) is also available as a fallback.
*   **Embedded Web Search:** DuckDuckGo results appear inside Cortana. The browser search engine in Settings controls searches opened in your browser.
*   **Optional AI replies:** Connect to an OpenAI-compatible provider with your own API key and model, or run a local server such as Ollama or LM Studio. Local servers do not need an API key unless you set one up. You can edit the model and reply instructions for any provider in Settings. Online providers receive questions that do not match a built-in command.
*   **Notebook:** Keep local notes and named lists. Try "create a shopping list", "add milk to my shopping list", "read my shopping list", or "mark milk as done on my shopping list". Existing tasks are kept in Tasks. Duplicate item names require choosing the item in the Notebook.
*   **My day:** Ask "my day" or open it in the Notebook for today's reminders, unfinished list items and running timers. "Call me Bluey" saves a local nickname for the summary, reminder notifications and "what is my name". The name is not added to online AI requests.
*   **Media and volume:** "Pause music" and "play music" request the intended playback state from players that expose Windows media controls. "Mute" and "unmute" are explicit; "set volume to 30 percent" sets the default playback device. "Volume status" reads its current level.
*   **Assistant Shortcut:** Select the shortcut button in Settings and press a combination such as Ctrl+Shift+C to record it. Choose Clear shortcut to remove it. The shortcut can optionally start voice recognition. Compatible hardware buttons can be mapped to it through device software.
*   **Background Preference:** Keep Cortana in the notification area for reminders and timers, or choose to quit when dismissed. They alert while Cortana runs. On restart, overdue timers alert once and recurring reminders deliver one overdue alert and advance to their next occurrence.
*   **Built-in Skills:**
    *   **Weather:** Ask "weather in Chicago" for current conditions, or save a weather city in Settings and ask "my weather". Weather needs an internet connection.
    *   **Calculator:** Type a simple calculation, like "12 * 3", to get a quick answer.
    *   **Time Lookup:** Ask for the time locally ("What time is it?") or in a city ("What is the time in Tokyo"). Supports 12-hour and 24-hour formats.
    *   **Jokes:** Ask Cortana to tell you a joke.
    *   **Reminders:** Try "remind me to call Nana tomorrow at 3 pm" or "remind me to stretch every Friday at 3 pm". The form supports daily, weekdays and weekly repeats. Weekly repeats use the selected date's weekday.
    *   **Timers:** Run up to 20 timers. Both "set a timer for 15 min" and "set a 15 min timer" work; add a name with "set a five minute timer named tea". Use "show timers" or "cancel tea timer". Timers survive quitting and restarting. Cancellation asks you to choose when more than one is running.
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

When a selected Edge voice fails to generate or play, Cortana explains that it is using your Windows voice for that reply. Your saved engine and voice choices stay in place. Regular Microsoft Zira is the local default, with Zira Desktop as a fallback when needed. Cortana keeps an unavailable Eva preference so it can use that voice when Windows exposes it again. Updates preserve existing voice assets.

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
npx --no-install electron scripts/offline-smoke.cjs --label=offline
npm run checkup -- --live
```

The smoke test checks interface workflows with a temporary profile and saves its results under `.verification`. It does not change your normal settings or Windows startup registration. Microphone actions are simulated.

The offline check blocks HTTP(S) requests in its test process and checks local commands, timer phrasing, Notebook saves and speech fallback. Audio and desktop actions are simulated. Add `--classic` for the classic window mode.

The checkup adds command, timer, reminder, conversion, response-cancellation and local AI integration checks. `--live` also tests weather, embedded search, Wikipedia, Edge speech synthesis, release checks and Everything availability. Desktop actions are recorded without executing them; the checkup uses a temporary profile and no personal API keys. Omit `--live` to skip the explicit service checks.

### Known limitations and troubleshooting

Speech recognition and the listening-related speaker pop remain unresolved on affected Windows systems. The installer does not fix these issues. You can continue using typed commands, Notebook and text-to-speech.

Microsoft's [WinRT speech documentation](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition) requires package identity, which the current NSIS installer does not provide. A temporary development identity and focused window have recognized built-in commands in a hardware probe, but free-form dictation still failed in that setup. This is not a verified workaround for the installed app, and updating dynwinrt alone does not resolve recognition.

If Windows is still loading its voices, a spoken reply waits briefly for them. If no local voice is available, or Windows reports a playback failure, Cortana shows a message with a shortcut to spoken-reply settings. Your saved voice choice is kept, including an unavailable Eva voice.

If you run into a speech problem, open **Settings > Troubleshooting > Copy speech diagnostics** and include the details in your report. Diagnostics include the full Windows build, package identity, window focus and speech-detection stages. If Cortana cannot confirm Online speech recognition consent, it explains why the microphone did not open. Windows can report `UserCanceled` even when you did not press Cancel. The diagnostics omit recognized speech, window titles and API keys.

See the [release notes](https://github.com/SoftBluey/Cortana-Electron/releases) for the changes and remaining limitations.

### This project is licensed under the GNU General Public License v3.0, see the LICENSE file for details.
