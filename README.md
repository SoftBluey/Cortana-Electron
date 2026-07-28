# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Features

*   **Edge Neural Text-to-Speech:** High-quality Microsoft Edge Neural voices for natural-sounding responses. System TTS (like Windows Zira) is also available as a fallback.
*   **Embedded Web Search:** Search results are fetched and displayed right inside the app in a clean dark-themed list. No need to leave the conversation.
*   **ChatGPT / AI Integration:** Connect to any OpenAI-compatible API for intelligent responses. Set your own API key, model, and system prompt.
*   **Built-in Skills:**
    *   **Weather Forecast:** Ask "weather in (City name!)" to get current conditions.
    *   **Calculator:** Type any simple math equation to get a quick answer.
    *   **Time Lookup:** Ask for the time locally ("What time is it?") or in any major city ("Time in Tokyo"). Supports 12-hour and 24-hour formats.
    *   **Jokes:** 54 dad jokes and counting.
    *   **Reminders:** Cortana can remind you to do things.
    *   **More:** Cortana can launch applications, tell you the day, and give you a drumroll!

### Built With

*   [Electron](https://www.electronjs.org/)
*   [node-edge-tts](https://www.npmjs.com/package/node-edge-tts)
*   HTML5
*   CSS3
*   Vanilla JavaScript

---

### Build it yourself

#### Prerequisites

You must have [Node.js](https://nodejs.org/) installed on your system (which includes npm).

Edge TTS (the default voice engine) works out of the box with an internet connection. If you prefer offline speech, switch to System TTS in settings and make sure you have at least one speech language installed in Windows.

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

### Building for Distribution

To create a distributable `.exe` installer for Windows, run the following command:

``` sh
npm run dist
```

### This project is licensed under the GNU General Public License v3.0, see the LICENSE file for details.
