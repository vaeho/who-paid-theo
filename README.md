# Who Paid Theo?

[Play the game](https://who-paid-theo.wvakho.chatgpt.site) · [Contribute](CONTRIBUTING.md)

An unofficial fan game: recognize a sponsor from Theo's setup before he names it. Not affiliated with or endorsed by Theo, t3.gg, YouTube, or any sponsor.

## Play

Listen to5 seconds, then guess a brand. Wrong guesses or Skip unlock10,15, then20 cumulative seconds. At20 seconds retries remain unlimited. Only a correct answer or explicit Reveal unlocks Next; the game never advances automatically. Fewer hints and wrong guesses earn more points. Type to search brands; arrows select, Enter fills, another Enter submits. Stats, theme and custom clips stay in your browser.

Current library:24 caption-supported beta reads across12 brands. These use caption cue bounds and official-player visual samples, not direct auditory or frame-perfect verification. Sources and start-audit uncertainty are retained per round. Metadata contains answers.

## Local development

No dependency installation or build step is required. Use Node.js for tests and Python3 for the development server:

```sh
npm run dev
# Open http://localhost:4173
npm test
python3 -m unittest discover -s tests -p '*_test.py'
```

`dist/` is the complete static site. Serve it over HTTP, not a file URL. `dist/engine.mjs` contains the pure state machine; `dist/app.mjs` manages the visible player and UI. `dist/editor.html` imports authorized local audio or reviewed YouTube ranges. Audio stays in IndexedDB and is never uploaded; metadata exports contain no audio.

## Playback compromise

The full official YouTube player remains visible with normal controls and branding. No media is downloaded, extracted or rehosted, and no voice is cloned. Native titles, chapters, captions, ads, seeking and timing delays can spoil an answer. Endpoints are best effort. Unavailable videos can be retried, opened on YouTube, or skipped. YouTube requires network access and may restrict embeds in some environments.

## Batch curation

`research/curation-pipeline.py` accepts timestamped caption metadata supplied by a researcher; it does not fetch media. It ranks conservative20-second caption gaps, marks already-shipped IDs and compares script shingles to flag repeated creative. It emits review leads only, never approved game rounds. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Rights and attribution

Application code has no open-source license selected yet; publishing source does not grant an additional software license. A maintainer must choose the application license. See [LICENSE.md](LICENSE.md).

SponsorBlock-derived segment metadata is separately **CC BY-NC-SA4.0**; see [DATA-LICENSE.md](DATA-LICENSE.md). Those terms are not replaced by any later application license. Theo's videos, sponsor marks, and third-party caption sources remain their owners' material; this repository grants no media rights. Fonts load from Google Fonts: DM Sans, Barlow Condensed, IBM Plex Mono.
