# EthLens

EthLens 是一个本地优先的 Ethereum 协议会议中英对照阅读器。视频、英文字幕和中文字幕集中存放，会议页面由 JSON 配置驱动，不再为每场会议创建顶层目录。

## 项目结构

```text
ethforkcast/
├── .agents/
│   └── skills/yt2bb/                 # 下载、GPT 字幕、B 站投稿与项目接入 skill
├── data/
│   ├── downloads/
│   │   ├── forkcast-july-2026.archive # 已处理的 7 月视频 ID
│   │   └── forkcast.archive           # 后续会议下载记录
│   └── meetings/
│       ├── index.json                 # 会议注册表
│       └── acde-241.json              # 单场会议配置与 Summary
├── media/
│   ├── videos/                        # 所有 MP4
│   └── subtitles/
│       ├── en/                        # 所有英文 SRT
│       └── zh/                        # 所有中文 SRT
├── public/
│   ├── assets/
│   │   ├── css/styles.css
│   │   └── js/
│   │       ├── archive.js             # 会议档案页
│   │       └── meeting.js             # 会议详情与字幕同步
│   ├── index.html
│   └── meeting.html
├── scripts/
│   └── check-meetings.mjs             # 会议、媒体和字幕一致性检查
├── server/
│   └── server.mjs                     # 本地静态与媒体服务器
├── package.json
├── skills-lock.json
└── README.md
```

目录职责固定如下：

- `public` 只保存浏览器直接使用的 HTML、CSS 和 JavaScript。
- `data` 只保存结构化会议数据和下载历史，不保存视频或字幕。
- `media` 只保存视频和字幕，并按文件类型、字幕语言分类。
- `server` 保存运行入口，`scripts` 保存离线校验工具。
- `.agents/skills/yt2bb` 保存已安装的下载处理 skill；`skills-lock.json` 保留在根目录供 skill 管理器使用。
- 根目录不再创建会议名称文件夹。

## 当前媒体

本地已整理 13 组会议资料：

- 13 个 MP4；
- 13 份英文 SRT；
- 13 份中文 SRT。

三类文件使用相同的基础文件名，字幕仅增加 `_en` 或 `_zh` 后缀。`data/meetings/index.json` 已注册这 13 组媒体，首页会按日期和会议系列展示全部会议。

ACDE #247（2026 年 10 月 8 日）已接入完整视频、1,710 条中英字幕、Forkcast Summary，以及 B 站来源 `BV1Nfpj67ELe`。会议页面为 `/meetings/acde-247`。

Git 仓库包含网页源码、13 场会议配置、中英 SRT 和封面。下载的 MP4 不纳入 Git，保留在本地 `media/videos/`；新克隆的项目可以阅读字幕和 Summary，ACDE #241、#247 可以切换到 B 站来源播放。其余会议需要先补齐对应 MP4。

项目内的 `yt2bb` 基于 [Agents365-ai/yt2bb](https://github.com/Agents365-ai/yt2bb) 扩展，保留其 [MIT 许可](.agents/skills/yt2bb/LICENSE)。扩展版本也可以从 [mark0-cn/yt2bb](https://github.com/mark0-cn/yt2bb) 单独安装。`skills-lock.json` 记录最初的上游安装信息；当前使用的扩展版本以 `.agents/skills/yt2bb` 中的代码为准。

## 运行

需要 Node.js 18 或更新版本。网页没有第三方 npm 依赖。

```bash
git clone https://github.com/mark0-cn/ethlens.git
cd ethlens
npm start
```

打开：

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/meetings/acde-241
http://127.0.0.1:4173/meetings/acde-247
```

本地服务器只公开以下内容：

- `public` 下的网页资源；
- `/data/*` 对应的会议 JSON；
- `/media/*` 对应的视频和字幕。

服务器支持 HTTP byte ranges，因此 MP4 可以直接拖动进度，不需要先完整载入。

## 新增会议

已完成下载和 GPT 审校的文件可以通过 skill 中的接入脚本登记，无需手动复制和修改注册表：

```bash
npm run integrate:meeting -- \
  --project-root . \
  --metadata /path/to/meeting-metadata.json \
  --video /path/to/meeting.mp4 \
  --en /path/to/meeting_en.srt \
  --zh /path/to/meeting_zh.srt \
  --youtube-url 'https://www.youtube.com/watch?v=VIDEO_ID' \
  --bvid BVxxxxxxxxxx --bilibili-status published \
  --dry-run
```

核对计划后去掉 `--dry-run` 执行。元数据字段参见下文；至少提供 `slug`、`series`、`number`、`title`、`subtitle`、`date`、`translationStatus`。脚本需要 Python 3，会校验字幕条数、序号和时间戳，拒绝覆盖内容不同的现有媒体，并按 slug 去重。重复执行相同导入不会重复登记或改写媒体。

B 站投稿仍由 [.agents/skills/yt2bb/references/bilibili.md](.agents/skills/yt2bb/references/bilibili.md) 的流程完成，接入脚本只记录已验证的 BV ID。审核中的投稿使用 `--bilibili-status pending_review`，通过审核后再改为 `published`，启用 B 站播放器；无需重新投稿。

### 1. 整理媒体

同一场会议的三个文件分别放入固定目录：

```text
media/videos/<meeting-name>.mp4
media/subtitles/en/<meeting-name>_en.srt
media/subtitles/zh/<meeting-name>_zh.srt
```

不要把 MP4、SRT 或会议配置放到项目根目录，也不要创建 `<meeting-name>/` 目录。

英文和中文字幕必须满足：

- cue 数量一致；
- 每条 cue 的序号一致；
- 每条 cue 的开始、结束时间完全一致；
- 中文只翻译字幕文本，不修改源时间轴；
- 中文使用 Codex GPT 结合上下文翻译，不使用 Whisper、平台中文轨或外部翻译器。

### 2. 创建会议配置

在 `data/meetings/<slug>.json` 创建配置。该目录中的媒体相对路径统一以 `../../media/` 开头：

```json
{
  "slug": "acde-242",
  "series": "ACDE",
  "number": 242,
  "title": "All Core Devs Execution #242",
  "subtitle": "执行层核心开发者会议",
  "date": "2026-08-06",
  "dateLabel": "2026 年 8 月 6 日",
  "agendaUrl": "https://github.com/ethereum/pm/issues/0000",
  "topic": "本次会议的主要议题",
  "translationStatus": "reviewed",
  "video": {
    "default": "local",
    "sources": [
      {
        "provider": "local",
        "label": "本地 MP4",
        "src": "../../media/videos/<meeting-name>.mp4",
        "type": "video/mp4",
        "available": true
      }
    ]
  },
  "subtitles": {
    "en": "../../media/subtitles/en/<meeting-name>_en.srt",
    "zh": "../../media/subtitles/zh/<meeting-name>_zh.srt"
  }
}
```

可以在 `video.sources` 中增加 B 站来源。启用的 B 站来源必须包含 `bvid`；实时字幕跟随仍应使用本地 MP4。

### 3. 注册会议

在 `data/meetings/index.json` 数组中增加一项：

```json
{
  "slug": "acde-242",
  "series": "ACDE",
  "number": 242,
  "title": "All Core Devs Execution #242",
  "subtitle": "执行层核心开发者会议",
  "date": "2026-08-06",
  "dateLabel": "2026 年 8 月 6 日",
  "agendaUrl": "https://github.com/ethereum/pm/issues/0000",
  "manifest": "data/meetings/acde-242.json",
  "translationStatus": "reviewed",
  "videoProviders": ["local"]
}
```

`slug` 必须唯一，并与会议配置中的 `slug` 一致。`videoProviders` 只控制档案页标签，应与配置中实际可用的视频来源保持一致。

### 4. 添加 Summary

`summary` 是会议配置中的可选字段，唯一内容来源是对应 Forkcast 会议页面底部的 Summary：

```text
https://forkcast.org/calls/<series>/<number>/
```

录入规则：

- 忠实保留 Forkcast 的 Highlights、Decisions、Action Items 和 Targets，不自行生成或补充结论；
- 保留原链接、状态、负责人和目标日期；
- `seek` 使用 Forkcast 时间戳换算后的秒数，并与本地 MP4 核对；
- `counts` 必须与对应分组的实际条目数一致；
- Forkcast 没有 Summary 时，省略整个 `summary` 字段。

若 Forkcast 配置含 `sync.transcriptStartTime` 和 `sync.videoStartTime`，需按 `seek = 摘要时间 - transcriptStartTime + videoStartTime` 对齐。ACDE #247 的偏移为 -876 秒；原摘要时间保留在各条目的 `sourceTimestamp` 中。

## 校验

```bash
npm run check
npm run check:meetings
```

校验覆盖：

- JavaScript 语法；
- 注册表中的会议配置是否存在；
- 本地视频和字幕路径是否有效；
- 中英文 SRT 的 cue 数量、序号和时间轴是否完全一致；
- B 站来源是否包含必要字段；
- Summary 统计、分组、文本和跳转时间是否有效。

`npm run check:meetings` 会同时检查本地 MP4 是否存在；新克隆的项目需补齐视频后再执行这项完整校验。只检查源码语法可执行 `npm run check`。

### 补齐本地视频

按照各会议 JSON 中本地来源的 `src` 保存 MP4；不要改名，否则无法与现有字幕和配置对应。会议的原始链接可从 `source.youtubeUrl`、`source.forkcastUrl` 或 `agendaUrl` 查找。以 ACDE #247 为例：

```bash
yt-dlp -f 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]' \
  --merge-output-format mp4 \
  -o 'media/videos/all-core-devs-execution-acde-247-october-8-2026.%(ext)s' \
  'https://www.youtube.com/watch?v=0ZGRqRYac1k'
```

需要 `yt-dlp` 和 `ffmpeg`。补齐视频时不使用下载 archive 跳过已登记的 ID，因为 archive 表示会议已处理，并不表示新克隆的电脑已有 MP4。

## 下载记录

`data/downloads/*.archive` 保存已经处理过的 YouTube 视频 ID。继续批量下载前先读取全部记录。接入脚本只在成功校验并登记 MP4、英文 SRT 和中文 SRT 后，将新 ID 追加到 `forkcast.archive`，已出现在任一 archive 中的 ID 不会重复追加。
