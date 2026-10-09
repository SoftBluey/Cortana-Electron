# Windows 10 1607 motion pass

## Reference and interpretation

Microsoft's [2015 UWP design guidelines](https://download.microsoft.com/download/2/4/A/24A81A29-77CF-4AA5-967E-64E42554F21B/UWP%20app%20design%20guidelines%20v1509.pdf) recommend dividing a page into a small number of naturally bounded regions, entering those regions in order, and keeping shared controls such as Back stationary. The original Windows UI [EntranceThemeTransition](https://learn.microsoft.com/en-us/uwp/api/windows.ui.xaml.media.animation.entrancethemetransition) provides a right-to-left entrance and region staggering, and was introduced in Windows 10 build 10240. [Content transitions](https://learn.microsoft.com/en-us/windows/apps/design/motion/content-transition-animations) keep the surrounding container fixed and bring new content upward; simple refreshes use fading.

This pass follows those period Windows UI patterns. The exact private Cortana 1607 animation timeline was not recovered. The narrow-pane distances, durations and easing below are a reconstruction, rather than timings extracted from Cortana. No later Fluent effects, panel zoom or bounce were added.

## Result

- Settings and Notebook backgrounds, Back buttons and rail icons stay fixed. The heading and body enter from 40 pixels to the right over 300 milliseconds with decelerating easing; the body follows the heading by 33 milliseconds. Content fades out over 83 milliseconds while the pane background stays in place until it can be hidden.
- Interrupted motion continues from its currently rendered position and opacity. Repeated destination clicks and repeated selection of the same Notebook page do not restart it. A stale exit cannot hide a reopened pane.
- The expanded navigation is revealed by clipping a fixed-width overlay instead of animating its layout width. The 48-pixel icon column and page width remain fixed. The expanded overlay is flat, without an added shadow. Its clipped region also restricts pointer hit testing.
- Settings uses its already-applied controls instead of rebuilding the form on each visit. Diagnostic labels still refresh. Scrollbars reserve their space, headings share the same Back-button spacing, and programmatic navigation focus does not scroll the pane.
- Search results use a short fade in a stationary container, replacing the full-height slide. Reminder and custom-action forms use a short upward content entrance. Long per-row reminder delays and vertical squashing on deletion were removed.
- The orb's authored GIFs and state protocol remain in use. Home keeps its 200-pixel idle canvas height; active requests retain their 110-pixel visible canvas height using a 0.55 transform scale. Translation and scale run together over 300 milliseconds without resizing the canvas's layout. Notebook keeps its 144-pixel idle canvas height and shared accent tint.
- Reduced-motion preference disables interface transitions and avoids the normal window-close animation wait.

## Verification

`scripts/motion-smoke.cjs` samples actual renderer frames using a disposable profile with wake listening disabled. The original Settings entrance moved both the pane and Back button by 18 pixels. The revised entrance checks require their displacement, and the rail icon displacement, to remain below 0.1 pixels. Additional checks cover expanded/collapsed pointer hit areas, repeated destinations, shared header alignment, rapid Notebook page changes and reopening, and reduced-motion navigation. Results are saved under `.verification/motion-*.json`.

The standard real-renderer workflow tests also cover Settings and Notebook switching, layout, idle animation lifecycle, orb proportions and the smaller active size in both window modes. These checks do not activate microphone capture.
