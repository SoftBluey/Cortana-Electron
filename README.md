# Cortana Electron

A custom, local Cortana client built with Electron, inspired by the classic design and functionality of Microsoft's original assistant. Not affiliated with Microsoft — this is a faithful recreation project.

### Features

- **Voice Search** — Click the microphone button in the search bar or enable "Hey Cortana" wake word detection. Uses native Windows speech recognition via Microsoft's WinRT API for fast, accurate, offline transcription.
- **"Hey Cortana" Wake Word** — Optional (off by default). Say "Hey Cortana" anytime and the slim UI pops up, ready for your voice command. Works even when the app is hidden.
- **Edge Neural Text-to-Speech** — High-quality Microsoft Edge Neural voices for natural-sounding responses. System TTS available as fallback.
- **Embedded Web Search** — Search results rendered right inside the app in a clean dark-themed list.
- **AI Integration** — Connect to any OpenAI-compatible API (OpenAI, Groq, DeepSeek, Ollama, LM Studio, and more). Set your own API key, model, and system prompt.
- **Built-in Skills:**
  - **Weather Forecast** — "weather in Tokyo"
  - **Calculator** — type any math equation
  - **Time Lookup** — local or any city, 12/24-hour formats
  - **Jokes** — 54 dad jokes and counting
  - **Reminders** — set time-based reminders with custom sounds
  - **More** — launch apps, tell the day, drumroll, Wikipedia search, and custom actions you define
- **Custom Actions** — Create your own voice/type commands with sequences of actions (speak, open app, open URL, play sound, run command)
- **Theming** — Custom accent color or sync with your Windows accent color

### Built With

- [Electron](https://www.electronjs.org/)
- [@microsoft/dynwinrt](https://www.npmjs.com/package/@microsoft/dynwinrt) — Native WinRT speech recognition
- [node-edge-tts](https://www.npmjs.com/package/node-edge-tts) — Edge Neural TTS
- HTML5, CSS3, Vanilla JavaScript

### Build it yourself

#### Prerequisites

[Node.js](https://nodejs.org/) with npm. Edge TTS works out of the box with internet. For offline speech, switch to System TTS in settings.

#### Installation & Running

```sh
git clone https://github.com/SoftBluey/Cortana-Electron
cd cortana-electron
npm install
npm start
```

#### Building for Distribution

```sh
npm run dist
```

Creates a Windows `.exe` installer.

### License

GNU General Public License v3.0 — see the [LICENSE](LICENSE) file.
