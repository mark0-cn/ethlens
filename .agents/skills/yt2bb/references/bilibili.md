# Bilibili publication with separate subtitle tracks

Use this mode when the user requests uploading/publishing the processed video to Bilibili. A download or translation request alone does not select this mode. Continue an upload already authorized in the conversation without asking for the same authorization again.

## Prepare the submission

- Use the completed original MP4 and reviewed Chinese SRT; also include the source-language SRT when the user asks to upload the bundle.
- Use an available Bilibili connector or uploader if it exposes the required operations. Otherwise use the browser tools and the existing signed-in account. Do not extract browser cookies just to automate a normal website upload.
- In Bilibili 创作中心 → 视频投稿, select the exact MP4 path and verify its filename, duration, and size before opening it. Native file pickers may remember an unrelated earlier selection; observe the path field before entering a path and verify the selected filename afterwards.
- Choose 内容为转载 for the original meeting recording. State the Ethereum channel/YouTube URL and meeting date in the source field. A concise title can use `【中文字幕】以太坊核心开发者会议 ACDE #<number>｜<date>`.
- Describe the actual meeting topics, link its Forkcast page, and disclose that the Chinese subtitles were translated and context-reviewed by GPT from the source captions.
- Use an appropriate knowledge/technology category and relevant tags. Inspect automatically inserted tags and remove unrelated ones. Choose a representative meeting frame as the cover, or follow a user-specified cover.

## Attach subtitles before submitting

The current web form supports 更多设置 → 字幕设置 → 上传字幕:

1. Select 中文 for Simplified Chinese and upload the `_zh.srt` file.
2. For the source English track, select English and use 继续上传 to upload `_en.srt`.
3. Confirm the language/filename mapping, click 确认, and wait for the main form to show `已上传【中文】、【En】字幕` (or the selected languages).

The MP4 remains the original recording; these are selectable subtitle tracks. Do not silently replace this with a burned-in version. If the website rejects the original caption overlaps, retain the original files and report the concrete error before retiming anything.

UI text and placement can change. Use current accessibility/DOM state; a read-only dropdown field may require clicking its arrow. Observe each tag insertion before adding the next tag, so asynchronous form updates do not drop alternate entries.

## Submit and verify

Verify the correct account, title, source attribution, cover, category, and attached subtitle languages. Submit once and require a visible success result. If the response is ambiguous, inspect content management/progress before retrying; do not create a second submission.

After `稿件投递成功`, 查看进度 exposes the assigned BV ID. Save that ID, the video/progress URLs, subtitle languages, and observed review status in the task's working files. Report upload/transcoding and moderation separately: an uploaded video under review is not yet publicly playable. Stop the publication task after verified submission unless the user also requests review follow-up.

For EthLens integration, record pending submissions with `--bilibili-status pending_review`; enable the Bilibili player with `published` only after the public video or approved status is verified. Read [ethlens.md](ethlens.md) when the user requests project integration.
