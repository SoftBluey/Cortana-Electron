# Electron Cortana, or... Cortana Electron!
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

We are not affiliated with Microsoft! We do not own the licenses for Cortana. This is just a faithful recreation project.

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back. (I love you Nana!)
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Features

*   **TTS Responses:** Utilizes the built-in system Text-to-Speech engine (like Windows Zira) to speak responses.
*   **Bing Web Search:** Opens a mobile-formatted Bing search in an integrated webview for general queries.
*   **Built-in Skills:**
    *   **Weather Forecast:** Ask "weather in (City name!)" to get current conditions.
    *   **Calculator:** Type any simple math equation to get a quick answer. (An example would be: 8*8)
    *   **Time Lookup:** Ask for the time locally ("What time is it?") or in any major city ("Time in Tokyo", "Time in CST").
    *   **Jokes:** Because every assistant needs some jokes. C'mon. (Local-only set of jokes that'll be expanded on over time.)
    *   **Reminders:** Cortana can remind you to do things.
    *   **More:** Cortana can launch applications for you. Cortana can tell you the day.
    *   **Other:** Cortana can also give you a drumroll! (Drumroll please?)

### Built With

*   [Electron](https://www.electronjs.org/)
*   HTML5
*   CSS3
*   Vanilla JavaScript

---

### Build it yourself

#### Prerequisites

If you want Cortana to be able to speak, make sure you have one or more languages with Speech installed in the Windows computer. Cortana's TTS is Microsoft Zira and will be the default if you have it available. If not, it'll choose whatever you have. You may change this in Cortana's settings pane.

You must have [Node.js](https://nodejs.org/) installed on your system (which includes npm).

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

This project is licensed under the MIT License, see the LICENSE file for details.
