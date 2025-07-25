# Cortana-Electron
A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant.

### About The Project

As a kid, my Nana got me into tech. What was one thing she let me do? Talk to Cortana. She had a whole Microphone setup for Cortana. I miss those days, and I want Cortana back.
...
So, I decided to try and work on bringing Cortana back, the way I remember.

### Features

*   **TTS Responses:** Utilizes the built-in system Text-to-Speech engine (like Windows Zira) to speak responses.
*   **Bing Web Search:** Seamlessly opens a mobile-formatted Bing search in an integrated webview for general queries.
*   **Built-in Skills:**
    *   **Weather Forecast:** Ask "weather in [CITY OR ZIP CODE RIGHT HERE]" to get current conditions. (Unfinished, buggy.)
    *   **Calculator:** Type any simple math equation to get a quick answer.
    *   **Time Lookup:** Ask for the time locally ("what time is it?") or in any major city ("time in Tokyo"). (Unfinished, buggy.)
    *   **Jokes:** Because every assistant needs some jokes. C'mon. (Local-only set of jokes that'll be expanded on over time.)

### Built With

*   [Electron](https://www.electronjs.org/)
*   HTML5
*   CSS3
*   Vanilla JavaScript

---

### Build it yourself

#### Prerequisites

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
