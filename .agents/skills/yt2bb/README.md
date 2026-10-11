# yt2bb - YouTube to Bilibili Video Repurposing

[中文文档](README_CN.md)

A Codex skill that downloads YouTube or Forkcast meeting video/captions, then generates a context-aware Chinese SRT with GPT. When requested, it publishes the original video with selectable subtitle tracks to Bilibili and imports the bundle into an existing EthLens project. Hardcoded bilingual subtitles remain optional.

Compatible with **Claude Code**, **OpenClaw**, **Hermes Agent**, **Pi (pi-mono)**, and indexed by **SkillsMP**.

## Workflow

```
YouTube → yt-dlp → source captions → validate → GPT context translation → GPT review → `_zh.srt`
```

| Step | Tool | Output |
|------|------|--------|
| Download | `yt-dlp` | `.mp4` |
| Source captions | `yt-dlp` | `_{lang}.srt` |
| Validate | `srt_utils.py` | Original caption timeline preserved |
| Translate/Review | GPT with context and glossary | `_zh.srt` |
| Merge | `srt_utils.py` | `_bilingual.srt` |
| Burn | `ffmpeg` | `_bilingual.mp4` |
| Publish Info | AI | `publish_info.md` |

The default outputs are the original MP4, source SRT, and reviewed Chinese SRT. Merge, burn, publication, and project integration are additional requested operations. Read [Bilibili publication](references/bilibili.md) and [EthLens integration](references/ethlens.md) for those modes. `scripts/integrate_meeting.py` provides dry-run, media conflict checks, and repeat-safe registration.

## Usage

```
/yt2bb https://www.youtube.com/watch?v=VIDEO_ID
```

## Installation

### Codex

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.codex/skills/yt2bb
```

Restart Codex or start a new session, then invoke `$yt2bb` with a YouTube or Forkcast URL. The [EthLens repository](https://github.com/mark0-cn/ethlens) also includes this skill under `.agents/skills/yt2bb`.

### Claude Code

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.claude/skills/yt2bb
```

### OpenClaw

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.openclaw/skills/yt2bb
```

### Hermes Agent

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.hermes/skills/media/yt2bb
```

### Pi (pi-mono)

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.pi/agent/skills/yt2bb
```

### Prerequisites

- Python 3
- [ffmpeg](https://ffmpeg.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- GPT translation/review in the current session
- Whisper is optional only for separately requested audio transcription; the default uses platform source captions.
- Browser cookies are used only when authentication is needed and the user has explicitly consented.

## Utility Script

```bash
# Detect platform and recommend whisper backend + model
python3 srt_utils.py check-whisper

# Merge EN and ZH subtitles
python3 srt_utils.py merge en.srt zh.srt output.srt

# Validate timing issues
python3 srt_utils.py validate input.srt

# Lint against Netflix Timed Text Style Guide (CPS, duration, line length, gaps)
python3 srt_utils.py lint bilingual.srt

# Fix timing overlaps
python3 srt_utils.py fix input.srt output.srt

# Convert to styled ASS (presets: netflix, clean, glow)
# Presets stay bottom-aligned and scale with resolution
# `netflix` = broadcast-grade: white text, thin outline, soft shadow, no box
python3 srt_utils.py to_ass bilingual.srt bilingual.ass --preset netflix
python3 srt_utils.py to_ass bilingual.srt bilingual.ass --style-file custom.ass

# Generate slug from title
python3 srt_utils.py slugify "Video Title"
```

All subcommands support `--format json` for structured agent-friendly output. `merge` and `to_ass` support `--dry-run` to validate inputs without writing files.

## Subtitle Preset Previews

All three presets rendered on the same 1920×1080 background, so you can compare typography, layout, and contrast at a glance.

| Preset | Preview | Use case |
|---|---|---|
| `netflix` | ![netflix preset preview](docs/presets/netflix.png) | **Default for professional content.** Pure white text, thin black outline, soft drop shadow, no box. Modeled on the Netflix Timed Text Style Guide. Best for documentaries, interviews, and long-form video. |
| `clean` | ![clean preset preview](docs/presets/clean.png) | **Readability safety net.** Golden-yellow text on a semi-transparent gray box. Use when `netflix`'s outline could get visually lost on busy or bright-heavy footage — the box guarantees a contrast pad. |
| `glow` | ![glow preset preview](docs/presets/glow.png) | **Entertainment / vlog.** Yellow ZH + white EN with a colored outer glow. Most eye-catching, least subtle — best for high-energy edits and B站-style content. |

To regenerate these images after changing a preset, run:

```bash
bash docs/presets/render_previews.sh
```

The script renders each preset against a neutral gradient background using the committed `docs/presets/sample.srt` fixture and writes `docs/presets/{preset}.png`.

## License

MIT License

## Credits

Based on [Agents365-ai/yt2bb](https://github.com/Agents365-ai/yt2bb), under its original [MIT license](LICENSE). This version adds GPT context translation and review, Forkcast source handling, Bilibili publication with selectable subtitle tracks, and repeat-safe EthLens integration.
