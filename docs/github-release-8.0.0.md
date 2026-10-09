**A big interface and stability update, with a much closer feel to the Cortana I remember.**

## New and improved

- Reworked the sidebar, Settings and Notebook transitions around the Windows 10 1607 design. Pages open more smoothly, Back buttons stay put, and switching pages quickly no longer leaves things overlapping or jumping around.
- Notebook now focuses on things the app can actually do: **Notes, Tasks, Reminders and About me.** Removed the filler pages and unused service/location options. Your existing notes, tasks and nickname are kept.
- The smaller Notebook Cortana uses the same idle animations and accent colour as the main orb. Its proportions are fixed, and active requests still use the smaller orb as before.
- Fixed orb timing and interrupted animation bugs, including click animations getting in the way of a newer request. The greeting appears as the window opens instead of waiting for settings to finish loading.
- Cleaned up Settings: the sidebar icon lines up properly, dropdowns fit, and the shortcut box is a sensible size. You can set a shortcut to open Cortana or start listening, including buttons mapped through your headset or keyboard software.

## Reliability and fixes

- Start with Windows now uses the packaged `.exe` and opens quietly in the tray. It respects Cortana being disabled in Windows Startup Apps, and development runs no longer register Electron at login.
- Notes, tasks, reminders and settings save more reliably. Missing Eva voices keep their saved preference, and regular Microsoft Zira is preferred over Zira Desktop for local speech.
- Improved built-in command routing, timers, reminders, app/folder launching and local AI connections. Local commands no longer wait on internet suggestions when you're offline.
- Restored the classic microphone on/off sounds. Speech failures give a readable message and a Settings shortcut; detailed diagnostics stay in Troubleshooting.
- Reduced animation memory use and background work. Updated Electron to **44.7.0**, refreshed the Windows bindings and dependencies, and removed unused assets and leftover code. The Windows installer is substantially smaller, too. The dependency audit reported **no known vulnerabilities**.

## Before using voice

**The reported Windows WinRT recognition failure and listening-related speaker pop are still unresolved.** This update improves the app's speech handling, but does not claim to fix that Windows/API problem. Manual voice search and “Hey Cortana” may still fail on affected systems. Typed commands remain available.

Download the **Setup `.exe`** to install Cortana. Installation does not need Developer Mode. The installer is unsigned and does not currently provide package identity for supported WinRT dictation. Checksums are included for the download.

## Checked for this release

40 unit tests passed, along with 22 interface workflows in both classic and movable window modes. Opening text, rapid navigation, reduced motion and packaged startup were also checked. A smoke-test demonstration was recorded separately; microphone actions in that demonstration are simulated.

Windows 10, ARM64 and additional real microphone/headset combinations still need testing. Please report anything that slips through, especially if you can include steps to reproduce it.
