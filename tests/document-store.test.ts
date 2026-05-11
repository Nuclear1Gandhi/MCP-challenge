import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DocumentStore } from "../src/document-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

describe("DocumentStore", () => {
  const store = new DocumentStore(dataDir);

  it("loads non-empty lesson and IEP manifests", async () => {
    const lm = await store.loadLessonManifest();
    const im = await store.loadIepManifest();
    expect(lm.sections.length).toBeGreaterThan(0);
    expect(im.sections.length).toBeGreaterThan(0);
  });

  it("reads full lesson and IEP bodies", async () => {
    const lesson = await store.readLessonFull();
    const iep = await store.readIepFull();
    expect(lesson.length).toBeGreaterThan(500);
    expect(iep.length).toBeGreaterThan(500);
  });

  it("reads first lesson section file when present", async () => {
    const m = await store.loadLessonManifest();
    const firstId = m.sections[0]?.id;
    expect(firstId).toBeTruthy();
    const body = await store.readLessonSection(firstId as string);
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(10);
  });

  it("collectHits returns empty array for blank query", () => {
    expect(store.collectHits("hello world", "   ", 5)).toEqual([]);
  });

  it("searchLesson returns structured matches for common token", async () => {
    const hits = await store.searchLesson("the", 2, 15);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      document: "lesson",
    });
    expect(hits[0]?.sectionId).toBeTruthy();
  });

  it("searchIep returns structured matches", async () => {
    const hits = await store.searchIep("student", 2, 15);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document).toBe("iep");
  });
});
