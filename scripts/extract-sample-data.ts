/**
 * One-time dev script: reads repo-root PDFs and writes normalized data under data/.
 * Run: npm run extract-data
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function readPdf(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const parsed = await pdfParse(buf);
  return parsed.text.replace(/\r\n/g, "\n");
}

function slugifyId(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base.length > 0 ? base : "section";
}

function sectionId(title: string, index: number): string {
  const ord = String(index).padStart(3, "0");
  return `${ord}-${slugifyId(title)}`;
}

function splitIntoSections(raw: string, docLabel: string): { id: string; title: string; body: string }[] {
  const lines = raw.split("\n");
  const chunks: { title: string; bodyLines: string[] }[] = [];
  let currentTitle = `${docLabel} — document`;
  let bodyLines: string[] = [];

  const flush = () => {
    const body = bodyLines.join("\n").trim();
    if (body.length > 0) {
      chunks.push({ title: currentTitle.trim(), bodyLines: body.split("\n") });
    }
    bodyLines = [];
  };

  const isHeading = (line: string): boolean => {
    const t = line.trim();
    if (t.length < 5 || t.length > 140) return false;
    const mostlyCaps =
      t === t.toUpperCase() &&
      /[A-Z]/.test(t) &&
      /^[A-Z0-9\s\-&:.,'/()]+$/.test(t) &&
      t.split(/\s/).length <= 18;
    const numbered = /^\d+\.\s+[A-Za-z]/.test(t);
    const partHeading = /^PART\s+[IVX]+\b/i.test(t) || /^SECTION\s+[A-Z0-9]+\b/i.test(t);
    return mostlyCaps || numbered || partHeading;
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentTitle = line.trim();
      continue;
    }
    bodyLines.push(line);
  }
  flush();

  if (chunks.length === 0) {
    return [{ id: "000-full", title: `${docLabel} — full text`, body: raw.trim() }];
  }

  return chunks.map((s, i) => ({
    id: sectionId(s.title, i),
    title: s.title,
    body: s.bodyLines.join("\n").trim(),
  }));
}

async function writeSections(dir: string, sections: { id: string; title: string; body: string }[]): Promise<void> {
  const secDir = path.join(dir, "sections");
  await fs.rm(secDir, { recursive: true, force: true });
  await fs.mkdir(secDir, { recursive: true });
  for (const s of sections) {
    const safeName = `${s.id}.md`;
    await fs.writeFile(path.join(secDir, safeName), `# ${s.title}\n\n${s.body}\n`, "utf8");
  }
}

async function main(): Promise<void> {
  const lessonPdf = path.join(ROOT, "lesson.pdf");
  const iepPdf = path.join(ROOT, "iep");

  const lessonText = await readPdf(lessonPdf);
  const iepText = await readPdf(iepPdf);

  const dataDir = path.join(ROOT, "data");
  const lessonDir = path.join(dataDir, "lesson");
  const iepDir = path.join(dataDir, "iep");

  await fs.mkdir(lessonDir, { recursive: true });
  await fs.mkdir(iepDir, { recursive: true });

  const lessonSections = splitIntoSections(lessonText, "Lesson");
  const iepSections = splitIntoSections(iepText, "IEP");

  await fs.writeFile(path.join(lessonDir, "lesson.md"), `${lessonText.trim()}\n`, "utf8");
  await fs.writeFile(
    path.join(lessonDir, "lesson.manifest.json"),
    JSON.stringify(
      {
        sourceFile: "lesson.pdf",
        sections: lessonSections.map((s) => ({ id: s.id, title: s.title })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeSections(lessonDir, lessonSections);

  await fs.writeFile(path.join(iepDir, "iep.full.md"), `${iepText.trim()}\n`, "utf8");
  await fs.writeFile(
    path.join(iepDir, "iep.manifest.json"),
    JSON.stringify(
      {
        sourceFile: "iep",
        sections: iepSections.map((s) => ({ id: s.id, title: s.title })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeSections(iepDir, iepSections);

  // eslint-disable-next-line no-console
  console.error(
    `[extract-sample-data] Wrote ${lessonSections.length} lesson sections, ${iepSections.length} IEP sections under data/`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
