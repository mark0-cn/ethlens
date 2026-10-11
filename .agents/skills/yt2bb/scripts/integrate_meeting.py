#!/usr/bin/env python3
"""Import a reviewed video/subtitle bundle into an existing EthLens project."""

import argparse
import datetime
import hashlib
import json
import math
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def timeline(path):
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    cues = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.splitlines()
        if len(lines) < 3 or not lines[0].isdigit() or not any(line.strip() for line in lines[2:]):
            raise ValueError(f"Malformed or empty subtitle cue in {path.name}")
        if not re.fullmatch(r"\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}", lines[1]):
            raise ValueError(f"Invalid subtitle timestamp in {path.name}, cue {lines[0]}")
        cues.append((int(lines[0]), lines[1]))
    if not cues or len({cue[0] for cue in cues}) != len(cues):
        raise ValueError(f"Empty subtitle file or duplicate cue IDs: {path.name}")
    return cues


def validate_summary(summary):
    totals = {"highlights": 0, "decisions": 0, "actions": 0}
    for section in summary.get("sections", []):
        items = section.get("items", [])
        if not section.get("title") or not items:
            raise ValueError("Summary sections require a title and items")
        kind = section.get("kind", "highlights")
        if kind in totals:
            totals[kind] += len(items)
        for item in items:
            seek = float(item.get("seek", -1))
            if not item.get("text") or not math.isfinite(seek) or seek < 0:
                raise ValueError("Summary items require text and a non-negative seek time")
    for key, kind in [("highlights", "highlights"), ("decisions", "decisions"), ("actionItems", "actions")]:
        if summary.get("counts", {}).get(key) != totals[kind]:
            raise ValueError(f"Summary {key} count does not match its sections")


def atomic_json(path, value):
    content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".yt2bb-tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)
    return True


def youtube_id(url):
    parsed = urlparse(url)
    if parsed.hostname in {"youtu.be", "www.youtu.be"}:
        candidate = parsed.path.strip("/")
    elif parsed.hostname in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        candidate = parse_qs(parsed.query).get("v", [""])[0]
    else:
        raise ValueError("--youtube-url must identify the source video on YouTube")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate):
        raise ValueError("Source URL has no valid YouTube video ID")
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--en", type=Path, required=True)
    parser.add_argument("--zh", type=Path, required=True)
    parser.add_argument("--youtube-url", required=True)
    parser.add_argument("--bvid")
    parser.add_argument("--bilibili-status", choices=["pending_review", "published"], default="pending_review")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = args.project_root.resolve()
    registry_path = root / "data/meetings/index.json"
    if not registry_path.is_file() or not (root / "public/meeting.html").is_file():
        raise ValueError("Target must be an existing EthLens project with its meeting registry")
    metadata = read_json(args.metadata)
    for key in ["slug", "series", "number", "title", "subtitle", "date", "translationStatus"]:
        if not metadata.get(key):
            raise ValueError(f"Missing meeting metadata: {key}")
    slug = metadata["slug"]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Meeting slug must use lowercase letters, digits, and hyphens")
    date = datetime.date.fromisoformat(metadata["date"])
    if not isinstance(metadata["number"], int) or isinstance(metadata["number"], bool) or metadata["number"] <= 0:
        raise ValueError("Meeting number must be a positive integer")
    if "summary" in metadata:
        validate_summary(metadata["summary"])
    metadata.setdefault("dateLabel", f"{date.year} 年 {date.month} 月 {date.day} 日")
    if args.bvid and not re.fullmatch(r"BV[A-Za-z0-9]{10}", args.bvid):
        raise ValueError("Invalid Bilibili BV ID")
    source_id = youtube_id(args.youtube_url)

    for path in [args.video, args.en, args.zh]:
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f"Media file is missing or empty: {path}")
    if args.video.suffix.lower() != ".mp4":
        raise ValueError("The local video must be an MP4")
    en_timeline, zh_timeline = timeline(args.en), timeline(args.zh)
    if en_timeline != zh_timeline:
        raise ValueError("English and Chinese cue counts, IDs, or timestamps differ")

    stem = args.video.stem
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", stem):
        raise ValueError("Use the yt2bb slug as the video filename")
    copies = [
        (args.video, root / "media/videos" / f"{stem}.mp4"),
        (args.en, root / "media/subtitles/en" / f"{stem}_en.srt"),
        (args.zh, root / "media/subtitles/zh" / f"{stem}_zh.srt"),
    ]
    for source, destination in copies:
        if not destination.resolve().is_relative_to(root):
            raise ValueError(f"Media destination leaves the project: {destination}")
        if destination.exists() and fingerprint(source) != fingerprint(destination):
            raise ValueError(f"Refusing to overwrite different existing media: {destination}")

    registry = read_json(registry_path)
    existing_rows = [row for row in registry if row.get("slug") == slug]
    if len(existing_rows) > 1:
        raise ValueError(f"Duplicate registry entries already exist for {slug}")
    manifest_path = root / "data/meetings" / f"{slug}.json"
    manifest = read_json(manifest_path) if manifest_path.exists() else {}
    if manifest.get("slug", slug) != slug:
        raise ValueError("Existing manifest identifies a different meeting")
    manifest.update(metadata)
    video = manifest.setdefault("video", {})
    video.setdefault("default", "local")
    sources = video.setdefault("sources", [])
    local_source = next((source for source in sources if source.get("provider") == "local"), None)
    if local_source is None:
        local_source = {}
        sources.insert(0, local_source)
    local_source.update(provider="local", label="本地 MP4", src=f"../../media/videos/{stem}.mp4", type="video/mp4", available=True)
    if args.bvid:
        bili_source = next((source for source in sources if source.get("provider") == "bilibili"), None)
        if bili_source is None:
            bili_source = {}
            sources.append(bili_source)
        published = args.bilibili_status == "published"
        bili_url = f"https://www.bilibili.com/video/{args.bvid}/"
        bili_source.update(provider="bilibili", label="B 站" if published else "B 站（审核中）", bvid=args.bvid, url=bili_url, page=1, available=published)
        manifest.setdefault("publication", {}).setdefault("bilibili", {}).update({
            "bvid": args.bvid,
            "url": bili_url,
            "status": args.bilibili_status,
        })
    manifest.setdefault("subtitles", {}).update(en=f"../../media/subtitles/en/{stem}_en.srt", zh=f"../../media/subtitles/zh/{stem}_zh.srt")
    manifest.setdefault("source", {})["youtubeUrl"] = args.youtube_url

    row = dict(existing_rows[0]) if existing_rows else {}
    for key in ["slug", "series", "number", "title", "subtitle", "date", "dateLabel", "agendaUrl", "translationStatus"]:
        if key in manifest:
            row[key] = manifest[key]
    row.update(manifest=f"data/meetings/{slug}.json", videoProviders=[source["provider"] for source in sources if source.get("available") is not False])
    registry = [entry for entry in registry if entry.get("slug") != slug] + [row]
    registry.sort(key=lambda entry: (entry.get("date", ""), int(entry.get("number", 0))), reverse=True)

    archive_line = f"youtube {source_id}"
    archives = list((root / "data/downloads").glob("*.archive"))
    archived = any(archive_line in path.read_text().splitlines() for path in archives)
    copied = []
    if not args.dry_run:
        for source, destination in copies:
            if not destination.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                copied.append(str(destination.relative_to(root)))
        manifest_changed = atomic_json(manifest_path, manifest)
        registry_changed = atomic_json(registry_path, registry)
        if not archived:
            archive = root / "data/downloads/forkcast.archive"
            archive.parent.mkdir(parents=True, exist_ok=True)
            separator = "\n" if archive.exists() and archive.stat().st_size and not archive.read_bytes().endswith(b"\n") else ""
            with archive.open("a", encoding="utf-8") as stream:
                stream.write(separator + archive_line + "\n")
    else:
        manifest_changed = registry_changed = None
    print(json.dumps({"slug": slug, "dryRun": args.dry_run, "subtitleCues": len(en_timeline), "media": [str(dest.relative_to(root)) for _, dest in copies], "copied": copied, "manifestChanged": manifest_changed, "registryChanged": registry_changed, "videoProviders": row["videoProviders"], "youtubeAlreadyArchived": archived}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f"Integration failed: {error}", file=sys.stderr)
        sys.exit(1)
