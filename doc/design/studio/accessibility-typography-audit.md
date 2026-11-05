# Accessibility and typography audit

This is a targeted browser audit of the Studio redesign, not a claim of WCAG conformance or coverage of every platform. Evidence and reproducible Playwright scripts are in the ignored `.taste-skill/studio/a11y-fonts/` directory. The browser was Google Chrome on Linux, with a locally served fixture; screenshots represent rendered application states rather than design mockups.

## Typography and color

The local IBM Plex Sans and JetBrains Mono faces loaded in Chrome. The rendered phone graph used 14 px UI text, 12 px IDs, a 16 px revset input, and 13 px diff code at the default browser size. At desktop width the graph text was 13 px. Font choice and small-text readability remain subjective and dependent on display, visual acuity and operating system; WCAG does not prescribe a universal minimum font size. Bundled faces loading does not establish which fallback will render every character on every system.

Measured contrast of selected examples exceeded the WCAG AA normal-text threshold of 4.5:1: selected graph description 14.23:1 light and 7.21:1 dark, selected graph ID 6.26:1 light and 4.87:1 dark, and a syntax comment in an added TypeScript line 7.71:1 light and 7.18:1 dark. A sampled light added-line number measured 4.91:1. These measurements include the composited backgrounds of the sampled states, and do not cover every syntax token, selection, status, disabled control, or theme combination. WCAG also has separate criteria for large text and non-text interface components. See [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Resize, reflow and input

Screenshots cover 320, 360, 390, 430, 768, 1024 and 1440 CSS-pixel widths in light and dark appearances; representative Full and syntax-highlighted diff states were also captured. The checked root document did not horizontally overflow at these widths. Individual graph text can be ellipsized and diff content has its own scrolling; this measurement alone does not prove every control or workflow reflows correctly. WCAG's [reflow criterion](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) includes exceptions for content requiring two-dimensional layout.

To test actual browser page zoom, the reproducible `zoom.mjs` script sets the zoom in Chrome's own `chrome://settings/appearance` in a temporary profile, then navigates to the application. At 200% the viewport was 640 CSS px wide with device pixel ratio 2; at 400% it was 320 CSS px wide with ratio 4. In the sampled Half and Full states the root did not overflow horizontally and the Full back button remained visible. This is browser zoom, not a CSS transform or device-scale emulation.

A separate Chrome default-font setting of 32 px exercised text enlargement without page zoom. Earlier graph-column overlap and a clipped revision heading were corrected; the inspected desktop screenshot shows separate ID and description columns and a visible heading. Graph descriptions can still truncate, particularly in a narrow layout. At 390 px with the same 32 px browser default, the loaded preview and Full view were exercised: Files, Details, Revision actions, the file navigator and Back all opened or returned successfully. Back and Revision actions were each 44 by 44 CSS px and entirely within the viewport; the document width remained 390 px. A separate real-Chrome component regression with 240 files verifies 44 px default rows, non-overlapping enlarged rows, and keyboard End revealing the final file; that test changes the root font size directly rather than using browser zoom. The sampled graph descriptions still truncate. The evidence records computed sizes and control rectangles in `text32-phone.json`. The [WCAG resize-text criterion](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) requires resizing up to 200% without loss of content or functionality, but these samples are not a complete criterion assessment.

Ten sequential keyboard Tab stops were inspected in the sampled Full view and showed visible focus without landing in an inert ancestor. Focus ring contrast against two sampled adjacent surfaces was approximately 6.27:1 in light and 6.80:1 in dark. The source includes reduced-motion and forced-colors handling; neither observation substitutes for full interactive testing with assistive technology. A rendered regression test checks phone font sizes, input sizing, local face loading and root overflow; its execution is tracked by the main validation run.

## Coverage limits

This audit did not verify actual screen-reader speech, all keyboard workflows, all loading and error states, all color pairs, every language or fallback glyph, physical mobile devices, on-screen keyboard occlusion, safe areas, or native readability across operating systems. A native WebKit font-family load was separately observed by the team; its readability was not established in this audit. More complete manual and automated coverage is required before asserting accessibility conformance.

## Findings addressed

| Before | After | Why |
| --- | --- | --- |
| Mobile revset and modal inputs inherited a 13 px specific rule. | Their mobile rules now allow at least 16 px and grow with the browser font. | Avoids small editable text and the common iOS input auto-zoom trigger. |
| At a 32 px browser default, graph IDs overlapped descriptions. | ID columns use scalable sizing; the inspected row columns remain distinct. | Enlarged text remains distinguishable. |
| The revision heading used a fixed 24 px line height. | The heading and panel controls now grow with text. | The inspected enlarged heading is not vertically clipped. |
| At 390 px and 32 px default font, the Full actions button extended beyond the viewport, bookmark chips clipped their text, and file names stayed 13 px. | The actions button fits, the sampled chip grew to 37 px without vertical overflow, and navigator file names enlarged. | These controls and labels remain usable in the checked enlarged-text flow. |
| Phone UI and code used the denser desktop sizes. | Phone UI uses 14 px, body 15 px and code 13 px at the default browser setting. | Improves sustained phone readability while preserving the desktop scale; this is a design recommendation, not a universal WCAG minimum. |

## Scoped verdict

Approve the inspected browser states for the issues measured above. This verdict does not extend to the untested platforms, assistive technologies, color combinations or workflows listed in Coverage limits.
