const { ipcRenderer } = require('electron');
const path = require('path');

let searchBar;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webviewContainer, webviewFrame;
let bingLinkContainer, bingLink;
let appContainer;

const isPackaged = __dirname.includes('app.asar') || __dirname.includes('electron.asar');
const appRoot = isPackaged ? path.join(process.resourcesPath, '..') : __dirname;

const assetsPath = path.join(appRoot, 'assets');

const idleGif = path.join(assetsPath, 'idle.gif');
const speakingGif = path.join(assetsPath, 'speaking.gif');
const speakingEndGif = path.join(assetsPath, 'speaking-end.gif');
const requestSound = new Audio(path.join(assetsPath, 'request.wav'));

let isBusy = false;
let ziraVoice = null;
let lastQuery = '';
let transitionToIdleListener = null;

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she should embrace her mistakes. She gave me a hug.",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "I'm reading a book on anti-gravity. It's impossible to put down!",
    "What do you call a fake noodle? An Impasta!",
    "Why don't skeletons fight each other? They don't have the guts."
];
function getJoke() { return jokes[Math.floor(Math.random() * jokes.length)]; }
const timeZoneAbbreviations = { 'est': 'America/New_York', 'edt': 'America/New_York', 'cst': 'America/Chicago', 'cdt': 'America/Chicago', 'mst': 'America/Denver', 'mdt': 'America/Denver', 'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles', 'gmt': 'Etc/GMT', 'utc': 'Etc/UTC', 'bst': 'Europe/London' };

window.addEventListener('DOMContentLoaded', () => {
    appContainer = document.getElementById('app-container');
    searchBar = document.getElementById('search-bar');
    animationContainer = document.getElementById('animation-container');
    gifDisplay = document.getElementById('gif-display');
    resultsDisplay = document.getElementById('results-display');
    contentWrapper = document.getElementById('content-wrapper');
    webviewContainer = document.getElementById('webview-container');
    webviewFrame = document.getElementById('webview-frame');
    bingLinkContainer = document.getElementById('bing-link-container');
    bingLink = document.getElementById('bing-link');

    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));

    searchBar.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') onSearch();
    });

    bingLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lastQuery) {
            const url = `https://www.bing.com/search?q=${encodeURIComponent(lastQuery)}`;
            ipcRenderer.send('open-external-link', url);
        }
    });

    webviewFrame.addEventListener('will-navigate', (e) => {
        e.preventDefault();
        ipcRenderer.send('open-external-link', e.url);
    });

    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1';
    webviewFrame.setAttribute('useragent', mobileUserAgent);

    ipcRenderer.on('start-close-animation', () => {
        appContainer.classList.remove('visible');
    });

    ipcRenderer.on('trigger-enter-animation', () => {
        appContainer.classList.add('visible');
    });

    setupTTS();
    setStateIdle();

    setTimeout(() => {
        searchBar.focus();
    }, 400);
});

function setupTTS() {
    function findVoice() {
        const voices = window.speechSynthesis.getVoices();
        ziraVoice = voices.find(voice => voice.name.includes('Zira')) || voices.find(voice => voice.lang === 'en-US') || voices[0];
    }
    findVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = findVoice;
    }
}

function speak(text, onSpeechEndCallback) {
    window.speechSynthesis.cancel();
    if (!ziraVoice || !text) {
        if (onSpeechEndCallback) onSpeechEndCallback();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = ziraVoice;
    utterance.onend = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
    utterance.onerror = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
    window.speechSynthesis.speak(utterance);
}

function setStateIdle() {
    if (transitionToIdleListener) {
        searchBar.removeEventListener('focus', transitionToIdleListener);
        transitionToIdleListener = null;
    }
    if (animationContainer.className === 'idle') return;

    ipcRenderer.send('set-webview-visibility', false);
    webviewContainer.classList.remove('visible');
    animationContainer.className = 'idle';
    gifDisplay.src = idleGif;
    resultsDisplay.textContent = "What's on your mind?";
    bingLinkContainer.style.display = 'none';
    isBusy = false;
}

function setStateActive() {
    if (transitionToIdleListener) {
        searchBar.removeEventListener('focus', transitionToIdleListener);
        transitionToIdleListener = null;
    }
    animationContainer.className = 'active';
}

function setFinishedSpeakingState() {
    setStateActive();
    gifDisplay.src = speakingEndGif;
    isBusy = false;

    setTimeout(() => {
        if (animationContainer.className.includes('active') && !webviewContainer.classList.contains('visible')) {
            gifDisplay.src = idleGif;
        }
    }, 1000);

    transitionToIdleListener = () => setStateIdle();
    searchBar.addEventListener('focus', transitionToIdleListener, { once: true });
}

function showWebView(url) {
    ipcRenderer.send('set-webview-visibility', true);
    webviewFrame.src = url;
    webviewContainer.classList.add('visible');

    speak(`Here's what I found on the web`, () => {
        gifDisplay.src = idleGif;
        isBusy = false;
        transitionToIdleListener = () => setStateIdle();
        searchBar.addEventListener('focus', transitionToIdleListener, { once: true });
    });
}

function showBingLink() {
    bingLinkContainer.style.display = 'block';
}

function calculate(query) {
    let responseText;
    try {
        const result = new Function('return ' + query)();
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation');
        }
        responseText = `The answer is ${result}.`;
    } catch (error) {
        responseText = `Sorry, that doesn't look like a valid calculation.`;
    }
    resultsDisplay.textContent = responseText;
    showBingLink();
    speak(responseText, setFinishedSpeakingState);
}

async function getWeather(location) {
    let responseText;
    try {
        const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!response.ok) throw new Error('API response not OK');
        const data = await response.json();
        const condition = data.current_condition[0];
        responseText = `The current weather in ${data.nearest_area[0].areaName[0].value} is ${condition.temp_F}°F and ${condition.weatherDesc[0].value}.`;
    } catch (error) {
        console.error("Weather fetch failed:", error);
        responseText = `Sorry, I couldn't get the weather for ${location}.`;
    }
    resultsDisplay.textContent = responseText;
    showBingLink();
    speak(responseText, setFinishedSpeakingState);
}

async function getTimeForLocation(rawInput) {
    let text;
    try {
        let timezonePath;
        const lowerCaseInput = rawInput.trim().toLowerCase();

        if (timeZoneAbbreviations[lowerCaseInput]) {
            timezonePath = timeZoneAbbreviations[lowerCaseInput];
        } else {
            timezonePath = rawInput.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('_');
        }

        const response = await fetch(`https://worldtimeapi.org/api/timezone/${timezonePath}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Invalid timezone');
        const dateTime = new Date(data.datetime);
        const formattedTime = dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const apiAbbreviation = data.abbreviation ? `(${data.abbreviation})` : '';
        text = `The time in ${rawInput.trim()} ${apiAbbreviation} is ${formattedTime}.`;
    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'.`;
    }
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, setFinishedSpeakingState);
}

function getLocalTime() {
    const now = new Date();
    const text = `The local time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, setFinishedSpeakingState);
}

function onSearch() {
    if (isBusy) return;

    if (transitionToIdleListener) {
        searchBar.removeEventListener('focus', transitionToIdleListener);
        transitionToIdleListener = null;
    }

    const query = searchBar.value.trim();
    if (!query) return;

    isBusy = true;
    lastQuery = query;
    webviewContainer.classList.remove('visible');
    requestSound.play();

    requestSound.onended = () => {
        bingLinkContainer.style.display = 'none';
        searchBar.value = '';

        const calculatorMatch = query.match(/^[\d\s\.\+\-\*\/()]+$/);
        const timeQueryMatch = query.match(/time (?:in|for|at) (.+)/i);
        const genericTimeMatch = query.match(/time(\s?now|\s?here)?\??$/i);
        const jokeMatch = query.match(/tell me a joke/i);
        const retiledMatch = query.match(/retiled/i);
        const weatherMatch = query.match(/^(?:what's the )?weather (?:in|for) (.+)/i);
        
        const burgerDogMatch = query.match(/LeGamer|KernelOS|Leg Hammer|KNS/i);

        const isWebSearch = !genericTimeMatch && !timeQueryMatch && !jokeMatch && !retiledMatch && !calculatorMatch && !weatherMatch && !burgerDogMatch && !joelMatch;

        setStateActive();
        gifDisplay.src = speakingGif;
        resultsDisplay.textContent = isWebSearch ? `Here's what I found on the web` : '';

        if (isWebSearch) {
            showWebView(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
        } 
        else if (burgerDogMatch) {
            const burgerDogResponse = "Burger dog, B-B-Burger dog!";
            resultsDisplay.textContent = burgerDogResponse;
            speak(burgerDogResponse, setFinishedSpeakingState);
        }
        else if (retiledMatch) {
            const retiledResponse = "Retiled? You mean that one project that gives discontinued services like me a second life? Noble work.";
            resultsDisplay.textContent = retiledResponse;
            showBingLink();
            speak(retiledResponse, setFinishedSpeakingState);
        } else if (jokeMatch) {
            const joke = getJoke();
            resultsDisplay.textContent = joke;
            showBingLink();
            speak(joke, setFinishedSpeakingState);
        } 
        else if (weatherMatch) {
            getWeather(weatherMatch[1]);
        }
        else if (calculatorMatch) {
            calculate(query);
        }
        else if (genericTimeMatch) {
            getLocalTime();
        } else if (timeQueryMatch) {
            getTimeForLocation(timeQueryMatch[1]);
        }
    };
}
