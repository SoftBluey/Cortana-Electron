This is a big one. A lot has changed since 3.6.5, here's everything:

**Edge Neural Text-to-Speech**
- Added Microsoft Edge Neural TTS as a new speech engine option, with 16 high-quality neural voices
- Edge TTS is now the default engine (requires internet, audio is synthesized online)
- Removed broken voices (Davis, Sara, Corra, Elizabeth, en-US-Ryan) that didn't work
- System TTS still available as a fallback for offline use

**Embedded Web Search**
- Web search results now display directly inside the app instead of opening in a browser
- Searches use DuckDuckGo under the hood, results are parsed and rendered in a custom dark-themed list
- Each result shows a clickable title, snippet, and URL
- "See more results on [engine]" footer links out for full results
- Search engine setting still controls which engine is used for external searches
- HTML entities in results (like apostrophes) are now properly decoded

**ChatGPT / AI Integration**
- New AI settings panel: enter your API key, pick a model, set a custom API URL, and write a system prompt
- Works with any OpenAI-compatible API (not just OpenAI itself)
- Default model is gpt-4o-mini
- Cortana falls back gracefully if AI is disabled or no key is set

**Time Format Setting**
- New 12-hour / 24-hour toggle in settings
- Applies to all time-related responses (current time, time in other cities, reminders, etc.)

**Settings UI Overhaul**
- Voice, pitch, rate, and engine settings only show what is relevant to the selected engine
- All selects and inputs now have consistent dark styling
- Neural voice selector properly aligns with the rest of the settings
- Moved voice warning below speech controls for better flow
- Time format toggle moved next to theme colour

**Suggestion System Cleanup**
- Removed emoji icons and type labels from search suggestions for a cleaner look
- Trimmed redundant suggestions (no more 3 variations of "tell me a joke")
- Reduced max suggestions from 5 to 4

**Bug Fixes**
- Fixed Electron vulnerability by upgrading from v38 to v43
- Fixed multi-monitor positioning, Cortana now appears on the correct monitor's taskbar
- Fixed duplicate IPC listener stacking when relaunching the app
- Fixed missing "update" HTML in the greeting response
- Fixed reminder ID collision that could cause wrong reminders to fire
- Fixed temporary TTS audio files not being cleaned up
- Fixed settings variable not being declared properly
- Fixed setting toggles (voice, pitch, rate) losing their flex layout when shown
- Fixed search result overflow from DDG image artifacts pushing content out of alignment
- Fixed brief scrollbar flashing on first app launch
- All IPC handlers now extracted into a dedicated function to prevent stacking on relaunch

**Other**
- 20 new jokes added (54 total)
- Version bumped to 4.2.0
