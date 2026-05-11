import fs from "node:fs/promises";
import path from "node:path";

export interface SectionRef {
  id: string;
  title: string;
}

export interface ManifestFile {
  sourceFile: string;
  sections: SectionRef[];
}

export interface SearchMatch {
  document: "lesson" | "iep";
  sectionId: string;
  sectionTitle: string;
  excerpt: string;
  characterIndex: number;
}

/**
 * Loads normalized lesson and IEP content produced by `npm run extract-data`.
 */
export class DocumentStore {
  constructor(private readonly dataRoot: string) {}

  private lessonDir(): string {
    return path.join(this.dataRoot, "lesson");
  }

  private iepDir(): string {
    return path.join(this.dataRoot, "iep");
  }

  async readLessonFull(): Promise<string> {
    return fs.readFile(path.join(this.lessonDir(), "lesson.md"), "utf8");
  }

  async readIepFull(): Promise<string> {
    return fs.readFile(path.join(this.iepDir(), "iep.full.md"), "utf8");
  }

  async loadLessonManifest(): Promise<ManifestFile> {
    const raw = await fs.readFile(path.join(this.lessonDir(), "lesson.manifest.json"), "utf8");
    return JSON.parse(raw) as ManifestFile;
  }

  async loadIepManifest(): Promise<ManifestFile> {
    const raw = await fs.readFile(path.join(this.iepDir(), "iep.manifest.json"), "utf8");
    return JSON.parse(raw) as ManifestFile;
  }

  async readLessonSection(sectionId: string): Promise<string | undefined> {
    try {
      return await fs.readFile(path.join(this.lessonDir(), "sections", `${sectionId}.md`), "utf8");
    } catch {
      return undefined;
    }
  }

  async readIepSection(sectionId: string): Promise<string | undefined> {
    try {
      return await fs.readFile(path.join(this.iepDir(), "sections", `${sectionId}.md`), "utf8");
    } catch {
      return undefined;
    }
  }

  /**
   * Finds case-insensitive substring hits with short excerpts (for tools).
   */
  collectHits(fullText: string, query: string, maxHits: number): { excerpt: string; characterIndex: number }[] {
    const q = query.trim().toLowerCase();
    if (!q || maxHits <= 0) {
      return [];
    }
    const lower = fullText.toLowerCase();
    const hits: { excerpt: string; characterIndex: number }[] = [];
    let pos = 0;
    while (hits.length < maxHits) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) {
        break;
      }
      const start = Math.max(0, idx - 100);
      const end = Math.min(fullText.length, idx + q.length + 140);
      let excerpt = fullText.slice(start, end).replace(/\s+/g, " ").trim();
      if (start > 0) {
        excerpt = `…${excerpt}`;
      }
      if (end < fullText.length) {
        excerpt = `${excerpt}…`;
      }
      hits.push({ excerpt, characterIndex: idx });
      pos = idx + Math.max(q.length, 1);
    }
    return hits;
  }

  async searchLesson(query: string, maxHitsPerSection: number, maxTotal: number): Promise<SearchMatch[]> {
    const manifest = await this.loadLessonManifest();
    const out: SearchMatch[] = [];
    for (const s of manifest.sections) {
      const body = await this.readLessonSection(s.id);
      if (!body) {
        continue;
      }
      const hits = this.collectHits(body, query, maxHitsPerSection);
      for (const h of hits) {
        out.push({
          document: "lesson",
          sectionId: s.id,
          sectionTitle: s.title,
          excerpt: h.excerpt,
          characterIndex: h.characterIndex,
        });
        if (out.length >= maxTotal) {
          return out;
        }
      }
    }
    return out;
  }

  async searchIep(query: string, maxHitsPerSection: number, maxTotal: number): Promise<SearchMatch[]> {
    const manifest = await this.loadIepManifest();
    const out: SearchMatch[] = [];
    for (const s of manifest.sections) {
      const body = await this.readIepSection(s.id);
      if (!body) {
        continue;
      }
      const hits = this.collectHits(body, query, maxHitsPerSection);
      for (const h of hits) {
        out.push({
          document: "iep",
          sectionId: s.id,
          sectionTitle: s.title,
          excerpt: h.excerpt,
          characterIndex: h.characterIndex,
        });
        if (out.length >= maxTotal) {
          return out;
        }
      }
    }
    return out;
  }

  async readContextResource(relativePath: string): Promise<string> {
    const full = path.join(this.dataRoot, relativePath);
    return fs.readFile(full, "utf8");
  }
}
