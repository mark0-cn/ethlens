# yt2bb - YouTube 视频转 Bilibili

[English](README.md)

一个 Codex 技能，下载 YouTube 或 Forkcast 会议视频和源语言字幕，使用 GPT 结合上下文生成并审校中文 SRT。按需将原视频和可切换字幕投稿到 B 站，并接入现有 EthLens 项目。双语硬字幕仍然是可选操作。

兼容 **Claude Code**、**OpenClaw**、**Hermes Agent**、**Pi (pi-mono)**，并可被 **SkillsMP** 索引。

## 工作流程

```
YouTube → yt-dlp → 源字幕 → 校验 → GPT 上下文翻译 → GPT 审校 → `_zh.srt`
```

| 步骤 | 工具 | 输出 |
|------|------|------|
| 下载 | `yt-dlp` | `.mp4` |
| 源字幕 | `yt-dlp` | `_{lang}.srt` |
| 校验 | `srt_utils.py` | 保留原字幕时间轴 |
| 翻译/审校 | GPT（上下文 + 术语表） | `_zh.srt` |
| 合并 | `srt_utils.py` | `_bilingual.srt` |
| 烧录 | `ffmpeg` | `_bilingual.mp4` |
| 发布信息 | AI | `publish_info.md` |

默认输出为原视频、源语言 SRT 和经 GPT 校对的中文 SRT。合并、烧录、投稿与项目接入仅在用户请求时执行。投稿参见 [B 站流程](references/bilibili.md)，项目接入参见 [EthLens 流程](references/ethlens.md)。`scripts/integrate_meeting.py` 支持预览计划、媒体冲突检查和重复执行时去重。

## 使用方法

```
/yt2bb https://www.youtube.com/watch?v=VIDEO_ID
```

## 安装

### Codex

```bash
git clone https://github.com/mark0-cn/yt2bb.git ~/.codex/skills/yt2bb
```

重启 Codex 或开启新会话后，用 `$yt2bb` 加上 YouTube 或 Forkcast 链接调用。[EthLens 仓库](https://github.com/mark0-cn/ethlens) 也在 `.agents/skills/yt2bb` 内附带本 skill。

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

### 前置依赖

- Python 3
- [ffmpeg](https://ffmpeg.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- 当前会话中的 GPT 翻译与审校能力
- Whisper 仅用于另行请求的音频转录，默认读取平台源语言字幕。
- 仅在需要认证且用户明确同意时使用浏览器 cookies。

## 工具脚本

```bash
# 检测平台并推荐 whisper 后端和模型
python3 srt_utils.py check-whisper

# 合并英文和中文字幕
python3 srt_utils.py merge en.srt zh.srt output.srt

# 校验时间轴问题
python3 srt_utils.py validate input.srt

# 按 Netflix Timed Text Style Guide 做 lint（阅读速度 / 时长 / 行长 / 间隔）
python3 srt_utils.py lint bilingual.srt

# 修复时间轴重叠
python3 srt_utils.py fix input.srt output.srt

# 转为带样式的 ASS 字幕（预设: netflix, clean, glow）
# 预设始终贴底显示，并会随分辨率自适应字号和边距
# `netflix` = 广电级：纯白字体 + 细黑描边 + 柔和阴影，无底框
python3 srt_utils.py to_ass bilingual.srt bilingual.ass --preset netflix
python3 srt_utils.py to_ass bilingual.srt bilingual.ass --style-file custom.ass

# 从标题生成 slug
python3 srt_utils.py slugify "视频标题"
```

所有子命令支持 `--format json` 输出结构化数据，方便 AI Agent 调用。`merge` 和 `to_ass` 支持 `--dry-run` 预检输入而不写入文件。

## 字幕预设效果预览

三套预设都在同一张 1920×1080 背景上渲染，方便直接对比字体、布局和对比度。

| 预设 | 效果图 | 适用场景 |
|---|---|---|
| `netflix` | ![netflix 预设预览](docs/presets/netflix.png) | **专业内容首选。** 纯白字体 + 细黑描边 + 柔和阴影，无底框。基于 Netflix Timed Text Style Guide。纪录片、访谈、长视频、所有"流媒体平台感"的内容都用它。 |
| `clean` | ![clean 预设预览](docs/presets/clean.png) | **可读性兜底。** 金黄色字体 + 半透明灰底框。当 `netflix` 的描边可能被花背景吃掉时选它——底框保证对比度。 |
| `glow` | ![glow 预设预览](docs/presets/glow.png) | **娱乐 / Vlog。** 黄色中文 + 白色英文 + 彩色外发光。最抢眼，也最不克制——适合高能剪辑和 B 站风格内容。 |

修改预设后，可通过以下命令重新生成预览图：

```bash
bash docs/presets/render_previews.sh
```

脚本会以 `docs/presets/sample.srt` 为样例在中性渐变背景上渲染每个预设，输出到 `docs/presets/{preset}.png`。

## 许可证

MIT 许可证

## 来源

基于 [Agents365-ai/yt2bb](https://github.com/Agents365-ai/yt2bb)，保留原始 [MIT 许可](LICENSE)。本版本增加 GPT 上下文翻译与审校、Forkcast 来源处理、B 站可切换字幕投稿，以及重复执行时去重的 EthLens 接入流程。
