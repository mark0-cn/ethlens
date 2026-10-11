---
name: yt2bb
description: Download YouTube or Forkcast meeting videos and timestamped source captions, then translate and review Chinese subtitles with GPT. Also use for requested Bilibili publication with subtitle tracks and integration into an existing EthLens project. Keep separate original video and SRT files by default.
---

# yt2bb - Video, GPT Subtitles, Bilibili, and EthLens

## Select the requested workflow

- Download/translation: follow the default workflow below and deliver the original MP4, source SRT, and reviewed Chinese SRT.
- Bilibili upload/publication: after the default outputs are complete, read [references/bilibili.md](references/bilibili.md). This mode requires a request to upload/publish; it is not implied by downloading or translating.
- ethforkcast/EthLens integration: read [references/ethlens.md](references/ethlens.md) and use `scripts/integrate_meeting.py` to import into the user's existing project. When both publication and integration are requested, reuse the verified BV ID instead of submitting another copy.

## Default result

For each YouTube URL, produce these default deliverables:

~~~
{slug}/
├── {slug}.mp4              # downloaded source video
├── {slug}_{src_lang}.srt   # YouTube-provided source captions, with timestamps
└── {slug}_zh.srt           # GPT-generated Chinese translation with the same timestamps
~~~

Do not run Whisper, merge the languages, convert to ASS, burn subtitles into a video, or generate Bilibili publish metadata unless the user separately requests those operations. Obtain only the requested source-language SRT from the platform's manual captions when available, then fall back to automatic captions. Generate the Chinese SRT with GPT using surrounding transcript context; never download or copy a platform-provided Chinese/translated track as the final output. If the source platform provides no captions, stop and report that limitation instead of silently transcribing audio.

## Requirements

The default workflow requires Python 3, yt-dlp, ffmpeg, and access to GPT in the current Codex session. Whisper is optional and must not be invoked by the default workflow. The user must provide a video URL and the source caption language, normally en. If the transcript is sensitive, tell the user that the text will be sent to GPT for translation and ask for a local-model alternative when appropriate.

## Workflow

### 0. Resolve the skill directory

Use the directory containing this loaded `SKILL.md` as `SKILL_DIR`; do not assume the current working directory is the skill's project. Stage files in the current task's work/output location, honoring its instructions. For EthLens, keep meeting folders out of the project root.

For a Forkcast call URL, resolve the embedded YouTube URL/ID from that page's video metadata or public call config. Record its meeting date, agenda URL, and optional `sync` fields for project integration. A `#t=...` fragment is a viewer position and must not crop the video.

If the user did not specify a source language, inspect available subtitle tracks and ask when the choice is ambiguous. For English videos, use `src_lang="en"` for the canonical output filename. Set `track_lang` to the exact source caption track code shown by `--list-subs`, such as `en` or `en-US`.

### 1. Inspect and download the video

Use --no-playlist for a single URL. The t=... query parameter is a playback position and must not crop the downloaded video.

~~~
url="https://www.youtube.com/watch?v=VIDEO_ID"
title="$(yt-dlp --no-playlist --skip-download --print title "$url")"
slug="$(python3 "$SKILL_DIR/srt_utils.py" slugify "$title")"
base="$slug/$slug"
mkdir -p "$slug"
yt-dlp --no-playlist -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" -o "$base.mp4" "$url"
~~~

If YouTube requires authentication, explain that browser cookies are credentials and ask for explicit user consent before using --cookies-from-browser chrome. When consent is given, add that option to each relevant yt-dlp command. Prefer a user-provided cookies.txt when possible. Never save or print cookie contents.

If an extracted stream returns HTTP 403, re-extract with a current yt-dlp and supported JavaScript runtime before attempting authentication. A task-local virtual environment can avoid changing the system installation. Do not keep retrying an expired saved stream URL.

### 2. Download timestamped source captions (no Whisper)

First inspect available caption tracks:

~~~
yt-dlp --no-playlist --list-subs "$url"
~~~

Prefer the requested language's manual captions:

~~~
yt-dlp --no-playlist --write-subs --sub-langs "$track_lang" --sub-format "srt/best" --convert-subs srt --skip-download -o "$base.%(ext)s" "$url"
~~~

If no source-language SRT was created, download YouTube automatic captions for the same language:

When the list includes an original-language automatic track such as `en-orig`, prefer that exact track over platform-translated alternatives. Keep the canonical output language filename as `en`.

~~~
yt-dlp --no-playlist --write-auto-subs --sub-langs "$track_lang" --sub-format "srt/best" --convert-subs srt --skip-download -o "$base.%(ext)s" "$url"
~~~

If both commands produce no matching caption file, stop. Tell the user that the video has no usable YouTube captions and offer Whisper only as an explicitly approved alternative.

When YouTube returns a regional language code such as en-US, choose the best matching track and copy it to the canonical name:

~~~
source_caption="$base.$track_lang.srt"
cp "$source_caption" "$base"_"$src_lang".srt
~~~

Prefer a manual caption over an .auto.srt caption. Do not choose a translated caption as the source-language file.

### 3. Validate the source timeline

~~~
source_srt="$base"_"$src_lang".srt
python3 "$SKILL_DIR/srt_utils.py" validate "$source_srt"
~~~

If validation reports timing warnings, keep the YouTube timestamps unchanged and report the warnings in the handoff. Do not run `fix` automatically: that command changes timestamps and can discard malformed blocks. Treat a missing file, zero parsed entries, or parser warnings about skipped blocks as a failure that must be reported before translation. The optional `fix` command may be used only after the user explicitly asks to repair the timeline.

Preserve the source entry count and every timestamp. Do not retime captions to fit a translation.

### 4. Generate Chinese with GPT and surrounding context

Do not download a translated caption track and do not copy an existing `_zh.srt` as the final output. If an existing Chinese SRT is present, ignore it by default; use it only as an explicitly disclosed reference for review. Generate the final Chinese text with GPT from the source-language transcript.

Process the transcript sequentially in context windows, never as isolated lines:

1. Use batches of roughly 12-30 cues or 30-90 seconds, depending on sentence density.
2. Include 2-4 cues before and after each batch as read-only context. List the target cue IDs separately so GPT knows exactly which cues it may write.
3. Keep a running Ethereum glossary and pass it into every batch. Add terms when the transcript introduces a client, EIP, fork, devnet, protocol mechanism, person, or abbreviation.
4. Preserve sentence continuity across cues. A sentence may span several cues, but output exactly one Chinese text for each source cue.
5. After the first translation pass, run a GPT review pass over each batch with the English context. Fix literal, awkward, ambiguous, or technically inconsistent Chinese without changing IDs or timestamps.

Use a structured instruction equivalent to:

~~~text
You are translating an Ethereum protocol-development meeting into natural Simplified Chinese subtitles.
Translate only the target cue IDs. Use the surrounding cues to resolve pronouns, incomplete sentences, speaker intent, and technical meaning. Do not invent facts or add explanations.
Keep EIP numbers, client names, fork/devnet names, code, URLs, units, and established English abbreviations unchanged unless the glossary specifies a Chinese form. Prefer concise spoken Chinese, but do not drop technical meaning.
Return JSON only: [{"id": 123, "zh": "..."}]
~~~

Translation rules:

1. Preserve every cue number and every `start --> end` timestamp exactly.
2. Produce exactly one Chinese entry for every source entry; never merge, split, reorder, or silently omit cues.
3. Use context to make Chinese natural. Do not translate word-by-word when the English sentence is fragmented across adjacent cues.
4. Keep names, EIP numbers, client names, code, URLs, units, and versions stable. Prefer glossary-approved terms over ad-hoc translations.
5. Keep subtitle text readable in the available duration. Use concise spoken Chinese and natural punctuation; do not force a word limit that removes meaning.
6. Preserve uncertainty, hedging, corrections, and questions. Do not turn a proposal into a decision.
7. Save only Chinese text in each Chinese cue; never include the English source or translator commentary.

Write the reviewed GPT output to:

~~~
"$base"_zh.srt
~~~

Then validate it and confirm that its entry count and every timestamp match the source SRT. Use `merge --dry-run` only as a count/structure check; it must not create a bilingual deliverable:

~~~
python3 "$SKILL_DIR/srt_utils.py" validate "$base"_zh.srt
python3 "$SKILL_DIR/srt_utils.py" merge --dry-run "$source_srt" "$base"_zh.srt "$base.unused.srt"
~~~

### 5. Handoff

Report links to exactly these three default outputs:

- {slug}.mp4
- {slug}_{src_lang}.srt
- {slug}_zh.srt

Include video duration, resolution, and subtitle entry count when available. Make clear that the video is the original downloaded video, the Chinese SRT was generated and context-reviewed by GPT, and the video does not contain burned-in subtitles.

## Optional legacy operations

Only perform these when the user asks explicitly:

- srt_utils.py merge to make one bilingual SRT
- srt_utils.py to_ass to create styled ASS subtitles
- ffmpeg -vf ass=... to burn subtitles into a new MP4
- AI-generated publish_info.md for Bilibili metadata

The existing utility commands remain available:

~~~
python3 "$SKILL_DIR/srt_utils.py" slugify "Video Title"
python3 "$SKILL_DIR/srt_utils.py" validate input.srt
python3 "$SKILL_DIR/srt_utils.py" fix input.srt output.srt
python3 "$SKILL_DIR/srt_utils.py" merge en.srt zh.srt bilingual.srt
python3 "$SKILL_DIR/srt_utils.py" to_ass bilingual.srt bilingual.ass --preset netflix
~~~

## Troubleshooting

### YouTube asks for sign-in

Do not probe browser credentials without consent. Ask the user to log into YouTube and close Chrome, then request permission to use --cookies-from-browser chrome, or ask for a manually exported cookies.txt path.

### YouTube has no captions

Do not invoke Whisper automatically. Explain that timestamped captions are unavailable and ask whether the user wants to approve local Whisper transcription as a separate workflow.

### Caption format is VTT or WebVTT

Use --convert-subs srt during the yt-dlp caption download. Do not parse timestamps with ad-hoc text replacement.

### Source and translation counts differ

Do not merge the files or fabricate missing cues. Re-read the source SRT, restore one-to-one numbering, and validate both files again.

### GPT output is literal, awkward, or inconsistent

Do not patch an isolated Chinese line without its context. Re-read the affected cue, its complete sentence, and at least 2-4 cues on both sides. Update the glossary when terminology drift caused the problem, then regenerate and review the whole affected batch while preserving cue IDs and timestamps.

## Privacy

- Browser cookies are credentials; use them only after explicit consent and never write their values to logs or files.
- YouTube captions are downloaded locally by yt-dlp.
- Translation is generated and context-reviewed by GPT in the current Codex session; sensitive transcripts should use a local model or be withheld from translation.
- srt_utils.py performs local parsing and validation and makes no network requests.
