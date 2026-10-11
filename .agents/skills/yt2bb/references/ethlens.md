# EthLens project integration

Use this mode when the user requests adding the processed meeting to an existing ethforkcast/EthLens project. Read the target project's README and applicable instructions first. Its `public/meeting.html` and `data/meetings/index.json` identify the supported layout.

The three canonical assets belong in `media/videos/`, `media/subtitles/en/`, and `media/subtitles/zh/`; meeting metadata belongs in `data/meetings/<slug>.json`. Do not create meeting folders in the project root. Stage downloaded files in the task's work/output directory until translation and timeline checks are complete.

## Metadata and import

Prepare a JSON metadata file with `slug`, `series`, `number`, `title`, `subtitle`, ISO `date`, and `translationStatus`. Use `reviewed` only after the GPT context-review pass is complete. Optional fields include `kicker`, `topic`, `agendaUrl`, `source.forkcastUrl`, and a project-format `summary`.

Run the helper from the loaded skill directory:

~~~sh
python3 "$SKILL_DIR/scripts/integrate_meeting.py" \
  --project-root /path/to/ethforkcast \
  --metadata /path/to/meeting-metadata.json \
  --video /path/to/meeting.mp4 \
  --en /path/to/meeting_en.srt \
  --zh /path/to/meeting_zh.srt \
  --youtube-url 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --bvid BVxxxxxxxxxx --bilibili-status published \
  --dry-run
~~~

Review the plan, then run the same command without `--dry-run`. Omit BV arguments when the video has not been submitted. Use `pending_review` for an unapproved submission. The helper copies the three files, preserves other manifest fields, updates the registry once per slug, and records the YouTube ID in `data/downloads/forkcast.archive` unless it is already present in any archive. It refuses media overwrite conflicts and differing subtitle IDs/timestamps. It makes no network requests and never uploads or republishes a video.

Re-running the same import is safe. To enable a previously pending Bilibili source, rerun with its verified BV ID and `--bilibili-status published` without uploading again. Keep local MP4 as the default for real-time transcript following; the Bilibili embed supports subtitle-click seeking but does not expose continuous playback progress to the reader.

## Forkcast Summary timestamps

Follow the project's Summary schema and source rules. Import the actual Forkcast Summary, including its decisions, owners, links, and dates; do not substitute a newly generated meeting summary. If there is no Summary, omit it.

Forkcast transcript/Summary times may have a different origin than the YouTube MP4. When the call config supplies `sync.transcriptStartTime` and `sync.videoStartTime`, compute:

`seek = summary timestamp - transcriptStartTime + videoStartTime`

Check representative anchors against the source SRT/video and require every seek to fall within the video. Preserve the original source timestamp in the import working files. Do not directly use unadjusted transcript timestamps for local-player links.

## Verify the result

Run `npm run check` and `npm run check:meetings` in the target project. Preview `/meetings/<slug>`, check the new archive entry, both subtitle languages, and a transcript/summary seek. Check the Bilibili source only if it is marked published. Report the meeting URL and current public-video state; deployment is a separate task unless requested.
