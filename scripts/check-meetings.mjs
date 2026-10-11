import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = join(root, "data", "meetings", "index.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const failures = [];

async function exists(relativePath) {
  try {
    const file = await stat(join(root, relativePath));
    return file.isFile();
  } catch {
    return false;
  }
}

function parseSrt(text) {
  return text.replace(/\r/g, "").trim().split(/\n\s*\n/).filter(Boolean).map(block => {
    const lines = block.split("\n");
    return { id: lines[0]?.trim(), timing: lines[1]?.trim() };
  });
}

for (const entry of registry) {
  if (!entry.slug || !entry.manifest) {
    failures.push(`${entry.slug || "<unknown>"}: missing slug or manifest`);
    continue;
  }

  if (!await exists(entry.manifest)) {
    failures.push(`${entry.slug}: manifest not found (${entry.manifest})`);
    continue;
  }

  const manifest = JSON.parse(await readFile(join(root, entry.manifest), "utf8"));
  const base = entry.manifest.slice(0, entry.manifest.lastIndexOf("/") + 1);
  for (const [language, relativePath] of Object.entries(manifest.subtitles || {})) {
    if (relativePath && !await exists(base + relativePath)) failures.push(`${entry.slug}: ${language} subtitle not found`);
  }

  for (const source of manifest.video?.sources || []) {
    if (source.provider === "local" && source.available !== false && source.src && !await exists(base + source.src)) {
      failures.push(`${entry.slug}: local video not found (${source.src})`);
    }
    if (source.provider === "bilibili" && source.available && !source.bvid) {
      failures.push(`${entry.slug}: available Bilibili source has no bvid`);
    }
  }

  if (manifest.summary) {
    const sections = manifest.summary.sections || [];
    const countByKind = kind => sections
      .filter(section => section.kind === kind)
      .reduce((total, section) => total + (section.items || []).length, 0);
    const expectedCounts = {
      highlights: countByKind("highlights"),
      decisions: countByKind("decisions"),
      actionItems: countByKind("actions")
    };
    for (const [key, expected] of Object.entries(expectedCounts)) {
      if (Number(manifest.summary.counts?.[key]) !== expected) {
        failures.push(`${entry.slug}: summary ${key} count does not match section items`);
      }
    }
    for (const section of sections) {
      if (!section.title || !(section.items || []).length) failures.push(`${entry.slug}: summary section is missing a title or items`);
      for (const item of section.items || []) {
        if (!item.text || !Number.isFinite(Number(item.seek)) || Number(item.seek) < 0) {
          failures.push(`${entry.slug}: summary item is missing text or a valid seek time`);
        }
      }
    }
  }

  const enPath = manifest.subtitles?.en && join(root, base, manifest.subtitles.en);
  const zhPath = manifest.subtitles?.zh && join(root, base, manifest.subtitles.zh);
  if (enPath && zhPath && await exists(base + manifest.subtitles.en) && await exists(base + manifest.subtitles.zh)) {
    const en = parseSrt(await readFile(enPath, "utf8"));
    const zh = parseSrt(await readFile(zhPath, "utf8"));
    if (en.length !== zh.length) {
      failures.push(`${entry.slug}: subtitle count mismatch (${en.length}/${zh.length})`);
    } else if (en.some((cue, index) => cue.id !== zh[index].id || cue.timing !== zh[index].timing)) {
      failures.push(`${entry.slug}: subtitle IDs or timestamps differ`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Meeting registry valid: ${registry.length} meeting(s)`);
}
