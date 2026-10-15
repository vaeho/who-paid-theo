# Contributing

Issues and pull requests are welcome. Original application code is licensed under [MIT](LICENSE.md). Unless explicitly stated otherwise, contributions of original code and documentation are submitted under the same MIT license. Third-party clip metadata and media are excluded from that grant; preserve their separate terms and attribution in [DATA-LICENSE.md](DATA-LICENSE.md). Submit only material you are entitled to contribute.

## Code changes

Keep the minimal interface accessible on desktop and mobile. Preserve5/10/15/20-second cumulative stages, unlimited final-stage retries, explicit Reveal/Next, local-only stats, and a fully visible official YouTube player. Run `npm test`, the Python curation tests, and relevant browser checks. Exercise repeated clicks, replay, stale player callbacks and unavailable media. Do not commit credentials, environment files, downloaded media, personal storage exports, private screenshots or full transcripts.

## Propose a real round

Open an issue or PR with the official video URL, sponsor identity evidence in its official description, a distinct setup/story description, and a public caption source with timestamped cue bounds. A long sponsor segment alone does not prove a long unbranded setup. Do not interpolate word times or add unrelated lead-in to reach20 seconds.

Use the creator editor to prepare metadata. A reviewer must align the actual setup opener in the official player, inspect the whole proposed20-second interval, and establish a safe cutoff before the earliest audible or visual brand reveal. Document uncertainty honestly. Short/uncertain reads remain research-only. Compare scripts: multiple different reads for one sponsor are welcome; copies of the same creative are not.

The shipped schema includes `id`, `videoId`, `answer`, `aliases`, `start`, `safeEnd`, `hintDurations:[5,10,15,20]`, `creativeId`, source evidence and start audit. Existing beta records explicitly say caption-supported/visually sampled rather than claiming direct auditory verification. Do not upgrade those claims without actually completing review. No new clip enters the library solely from automated triage.

## Batch researcher handoff

Supply a local JSON array with records shaped as follows; text below is a synthetic schema example, never a Theo claim:

```json
[{"videoId":"abcdefghijk","title":"Synthetic example","publishedDate":"2025-01-01","sourceUrl":"https://www.youtube.com/watch?v=abcdefghijk","transcriptUrl":"https://example.com/caption-source","segments":[{"start":10,"end":15,"text":"Synthetic sponsor transition"},{"start":15,"end":40,"text":"Synthetic setup scenario"},{"start":45,"end":50,"text":"Synthetic brand mention"}]}]
```

```sh
python3 research/curation-pipeline.py /path/to/caption-metadata.json --output /tmp/review-queue.json
```

Output contains conservative cue-level candidates, disabled by default, with source URLs, similarity flags and review status. Keep full caption inputs outside this repository; include only the short evidence excerpts needed for review. Never extract audio/video, bypass blocked transcript providers or contact third parties on the project's behalf.
