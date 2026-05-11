# Waypoint Challenge — Submission Notes

Hi Isaac — this file is written for you (the reviewer). The companion `README.md` is the canonical setup doc; this one explains **what I built, why I made the calls I made, and what to look at first** when you sit down to evaluate it.

If you only have five minutes, read sections 1, 2, and 6.

---

## 1. TL;DR — what this submission is

A local **MCP server** (TypeScript, stdio transport) that exposes the sample lesson and the anonymized IEP as a structured, citation-friendly knowledge surface, plus a **registered MCP prompt** that drives Claude through a strict output contract for teacher-usable differentiation.

The bet is simple: the highest-leverage thing I can do here is **make the LLM's job structurally easy** — chunk the source documents so the model can cite them precisely, give it both broad-stroke and surgical access patterns, and put the pedagogical scaffolding inside a registered prompt so the output is auditable rather than vibes-based.

What you'll find in the repo:
- `src/server.ts` — MCP server: resources, tools, and the prompt registration.
- `src/document-store.ts` — file-backed store over the normalized `data/` directory.
- `src/differentiation.ts` — the output contract and prompt body (the actual product).
- `scripts/extract-sample-data.ts` — one-shot dev script that converts `lesson.pdf` and `iep.pdf` into `data/lesson/` and `data/iep/`.
- `data/lesson/`, `data/iep/`, `data/context/udl-primer.md` — committed normalized inputs the server actually reads.
- `tests/document-store.test.ts` — unit tests against committed fixtures.

---

## 2. How to actually see it work

```bash
npm install
npm run build
npm start            # or: npm run dev
```

For the registered prompt, **Claude Desktop config**:

```json
{
  "mcpServers": {
    "waypoint-differentiation": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "C:\\projects\\waypoint-challenge"
    }
  }
}
```

**Important UX caveat I want to flag explicitly:** in Claude Desktop, typing "run the differentiate prompt" in plain chat does *not* reliably invoke the registered MCP prompt — the model will improvise a nice-looking narrative that doesn't follow the contract. The reliable invocation is:

> Click the **`+`** (insert) button → select the prompt **`differentiate_for_iep_student`** → send.

If you don't invoke it through the UI, the citation grounding falls apart, and that's the whole point of this submission. I left a callout for this in the in-tool description as well.

Tests:

```bash
npm test
```

---

## 3. Architecture decisions and the reasoning behind them

I'll walk through each call by the evaluation criteria you listed in `README.md`.

### 3.1 Data shape — "Architecture decisions" / "Domain understanding"

I normalized both PDFs into the same shape, on purpose:

```
data/
  lesson/
    lesson.md                       # full text
    lesson.manifest.json            # [{ id, title }, ...]
    sections/<id>.md                # one file per section
  iep/
    iep.full.md
    iep.manifest.json
    sections/<id>.md
  context/
    udl-primer.md
```

Why this shape:

- **Section ids are the citation primitives.** The output contract requires every bullet to cite a `(Lesson <sectionId> "<title>")` or `(IEP <sectionId> "<title>")` pair. Giving the model stable, slugged ids (e.g. `030-3-ela`, `016-academics`, `027-measurable-annual-goals`) means citations point to a thing that exists on disk and can be re-fetched. Generic "page 4 of the IEP" citations are not auditable; these are.
- **Chunking respects visible structure.** `scripts/extract-sample-data.ts` uses heading heuristics from the PDF, not arbitrary token windows. The reason: when a teacher reads "IEP 030-3-ela" in the output, they should be able to flip to that section of the IEP and see the same wording. Token-sliced chunks would break that 1:1 mapping.
- **A manifest exists.** The model never has to *guess* what's in the document — `list_iep_sections` returns the table of contents. This is the cheapest possible way to reduce hallucinated section references.
- **Committed extracted files, not live PDF parsing.** The running server reads Markdown only. `npm run extract-data` is a one-shot dev script. Two reasons: (a) tests stay deterministic — `pdf-parse` can drift on whitespace; (b) deploying the server doesn't need a PDF stack. I think the production version of this looks the same: a district pipeline writes IEPs into a normalized store, the MCP layer reads from that.

### 3.2 Resources vs tools — both, on purpose

I exposed the same data three ways and I want to be explicit about why:

| Surface | URI / name | Job to be done |
|---|---|---|
| Full-document resources | `lesson://document`, `iep://document` | "Pull the whole thing in." Cheap for short docs, useful when the model wants global context. |
| Section-template resources | `lesson://section/{sectionId}`, `iep://section/{sectionId}` | Enumerated, completion-supported URIs so the host UI can browse sections like files. List + complete are implemented. |
| Tools | `list_lesson_sections`, `list_iep_sections`, `get_lesson_section`, `get_iep_section`, `search_lesson`, `search_iep` | The model's working surface during reasoning — small, precise, citation-friendly. |
| Context resource | `context://udl-primer` | A short UDL-flavored primer authored in this repo so the model has a pedagogical lens *without* my having to embed it in the prompt body. |

The tools are deliberately the path the prompt steers the model toward. Resources are great for human inspection and for hosts that auto-attach context, but a model reasoning about "what does this kid need for *this* paragraph" should be doing targeted `get_iep_section` / `search_iep` calls and quoting the result, not pasting the whole IEP into its working memory. The prompt body in `src/differentiation.ts` enforces that explicitly:

> "Pull exact wording from 2–4 relevant lesson sections and 2–4 relevant IEP sections using `get_lesson_section`/`get_iep_section` or `search_lesson`/`search_iep`."

### 3.3 The prompt as the actual product

`src/differentiation.ts` is the part of this repo that does the most work for the teacher.

It bundles three things:

1. **A six-section output contract** (Lesson anchor → Student-linked needs → Scaffolds → Materials and procedures → Assessment → Accommodation checklist). The shape is intentionally that of a lesson plan a teacher would actually print, not a generic "differentiation strategies" essay.
2. **A grounding rule.** Every bullet has to cite a `(Lesson …)` or `(IEP …)` section, or be tagged `(UDL)` if it's general best practice. The `(UDL)` escape hatch is intentional — without it, the model gets squeezed into either fabricating a citation or omitting useful pedagogy.
3. **A required *procedure* before drafting** — list both manifests, pull 2–4 sections from each, build a citation map, *then* write. This is the single biggest difference between output that reads like a real IEP-aware lesson plan and output that reads like a ChatGPT recipe.

I want to flag one trade-off: I chose a *narrow* output contract over a flexible one. The contract has exactly six top-level sections and a checkbox-style accommodation list. That deliberately rules out exotic outputs (e.g. tables of weekly progressions) in exchange for something a teacher can use *tomorrow morning* without further editing — which is your stated bar in the challenge description.

### 3.4 Code quality choices worth calling out

- **`DocumentStore` is the only thing that touches the filesystem.** `server.ts` doesn't read files directly. This is what makes the vitest suite trivial — point the store at a different `dataDir` and you're done.
- **`paths.resolveDataDir()` is the one indirection** — `DATA_DIR` env var override, default `./data`. Single function so every call site agrees.
- **No try/catch firehose.** Section fetches return `undefined` and the tool layer turns that into a structured `isError: true` MCP response. Errors are surfaced to the host, not eaten.
- **`zod` v4 for input schemas** on tools, including descriptions — those descriptions appear in the host UI and matter for model-side discovery.
- **Stdout discipline.** stdout is reserved for MCP protocol traffic; only `stderr` is used for logging. This is a foot-gun specific to stdio MCP and worth being explicit about.

---

## 4. What the output looks like (real run, not a mock)

Below is the differentiated lesson plan I got out of the system for the sample lesson ("What Is 'Community' and Why Is It Important?" by Toby Lowe) against the committed IEP (anonymized as "Jasmine Regina Bailey"). Every parenthetical citation in this output corresponds to a real section id and title under `data/lesson/sections/` or `data/iep/sections/`, so you can spot-check any claim against the source.

The shape maps 1:1 to the six required sections from `src/differentiation.ts`; the host model rendered the headings as numbered sections plus a subtitle line, which I'm preserving here because it's the actual run.

---

### Differentiated Lesson Plan — "What Is 'Community' and Why Is It Important?" (Toby Lowe)

**Student:** Jasmine Regina Bailey | Grade 7 | IEP Active

#### 1. Lesson Anchor — Part(s) of the Lesson Being Adapted

The three lesson components being adapted for Jasmine are:

- **During Reading Questions (whole-class and partner phases):** Jasmine will need structured support to engage with the annotation and text-tracking demands of Paragraphs 1–2 and Paragraphs 5–7 (Lesson 001-whole-class-reading-during-reading-questions, 002-partner-reading-during-reading-questions, 003-whole-class-reading-during-reading-questions).
- **Independent Practice — Short Response Prompt:** The prompt asking Jasmine to explain Lowe's phrase "a group of people who share an identity-forming narrative" [RI.2] represents significant independent writing demands (Lesson 007-4-how-do-paragraphs-5-7-help-the-reader-understand-the-autho).
- **Student-Led Discussion:** The partner discussion at the end of the lesson is an opportunity to leverage Jasmine's social strengths but requires pre-teaching to prevent shutdown if she feels academically unsure (Lesson 000-lesson-overview, 008-self-checklist).

#### 2. Student-Linked Needs — Ties to Specific IEP Goals or Accommodations

- **Reading comprehension significantly below grade level:** Jasmine is reading at a third-grade level with Informational Text Comprehension at Grade 2 on iReady Fall 2025. She "struggles to provide accurate answers" to both literal and inferential comprehension questions verbally and in writing. (IEP 016-academics "ACADEMICS"; IEP 030-3-ela "3 - ELA")
- **Low reading and writing stamina; requires prompting for comprehension strategies:** Jasmine "has low reading and writing stamina and requires frequent reminders to utilize comprehension skills such as tracking the text, annotating, rereading, etc. when working independently." (IEP 016-academics "ACADEMICS")
- **Avoidance behaviors triggered by academic frustration:** "When faced with grade-level literacy tasks that she finds difficult, she struggles to sustain attention and often disengages by quietly putting her head down or asking to use the restroom multiple times." A pattern exists where "academic frustration leads to avoidance behaviors." (IEP 016-academics "ACADEMICS"; IEP 017-behavioral-social-emotional "BEHAVIORAL/SOCIAL/EMOTIONAL")
- **Self-regulation goal:** Jasmine's IEP targets her "improv[ing] her self-regulation skills by using a taught calming strategy…to calm her body and re-engage back to tasks 4 out of 5 opportunities." Short-term benchmarks include recognizing physical cues of frustration and independently initiating a calming strategy. (IEP 027-measurable-annual-goals "MEASURABLE ANNUAL GOALS")
- **ELA comprehension and writing goal:** Jasmine's annual ELA goal targets increasing her ability "to comprehend complex texts to independently answer literal and inferential comprehension questions or writing prompts" from 50% to 75% accuracy. Benchmarks include accurately annotating a text for the prompt and independently writing a claim supported by textual evidence. (IEP 030-3-ela "3 - ELA")
- **Responds well to 1:1 check-ins, graphic organizers, and positive praise:** "Her use of [graphic organizer] supports is helping her find success and be more accurate with her responses." She is "open to feedback especially during 1-on-1 check-ins" and "motivated by specific positive praise." (IEP 016-academics "ACADEMICS"; IEP 026-accommodations-and-modifications "ACCOMMODATIONS AND MODIFICATIONS")

#### 3. Scaffolds — Questions, Sentence Frames, Graphic Organizers, Discourse Supports

- **Annotation scaffold for During Reading:** Provide Jasmine with a two-column annotation guide keyed to the lesson's vocabulary and During Reading Questions. Column 1: "Words or phrases I noticed." Column 2: "What I think this means about community." This directly supports the benchmark that "Jasmine will be able to accurately annotate a given text for the prompt." (IEP 030-3-ela "3 - ELA"; Lesson 001-whole-class-reading-during-reading-questions)
- **Sentence frames for During Reading Think & Share / Turn & Talk:**
  - For claim-identification: "Lowe says that community means ___. I know this because in paragraph ___ he writes ___."
  - For Turn & Talk (summarizing traits): "One key trait of a community is ___ because Lowe explains ___."
  - For the partner discussion: "I agree / disagree with my partner because ___."
  - These frames reduce the language production load while keeping Jasmine cognitively engaged with the comprehension task. (IEP 016-academics, 030-3-ela; UDL)
- **Graphic organizer for the short response prompt:** Provide a pre-structured organizer with labeled boxes:
  - My claim (What does Lowe mean by "identity-forming narrative"?)
  - Evidence from the text (quote + paragraph number)
  - My analysis (How does this evidence support my claim?)
  - This aligns directly to Jasmine's IEP benchmarks for claim writing and finding textual evidence. (IEP 030-3-ela "3 - ELA"; Lesson 007-4-how-do-paragraphs-5-7-help-the-reader-understand-the-autho)
- **Pre-teach key vocabulary before reading begins:** Review the four pronunciation/meaning words the lesson already lists (Aspect, Moral, Narrative, Specific) in a brief 1:1 or small-group preview. Add "identity-forming" and "normative" as critical to the short response prompt. (Lesson 000-lesson-overview; IEP 016-academics)
- **Positive entry point — discussion pre-loading:** Before the Student-Led Discussion, give Jasmine one question to prepare a response to in writing so she can refer to her notes during the partner talk. This leverages her strength of enjoying peer talk while reducing the risk of shutdown from being unprepared. (IEP 016-academics — "motivated by specific positive praise and enjoys being able to talk with her peers"; Lesson 008-self-checklist)

#### 4. Materials and Procedures — Concrete Changes for Tomorrow's Delivery

**Prepare the following before class:**

- Printed two-column annotation guide (see Section 3) clipped to Jasmine's copy of the article.
- Printed short-response graphic organizer (claim / evidence / analysis) with the prompt written at the top.
- Reference sheet listing the lesson's four vocabulary words with student-friendly definitions and phonetic spellings, matching the lesson's existing vocabulary list. (Lesson 000-lesson-overview)
- Sticky note on Jasmine's desk with her self-regulation menu (movement break, deep breathing, fidget tool) as a visual cue. (IEP 027-measurable-annual-goals)

**During class delivery:**

- **Intro / Slide Deck (5 min):** Seat Jasmine at the front (IEP 026-accommodations-and-modifications) and briefly preview vocabulary and purpose for reading with her before the whole-class slide deck begins.
- **Whole-Class Reading — Paragraphs 1–2 (During Reading Questions A, B, C):**
  - Use the asterisked (*) optional questions (B: "What is the relationship between the claim and the bulleted list?") with Jasmine, as the lesson notes these are "for students needing more support." (Lesson 001-whole-class-reading-during-reading-questions)
  - Give Jasmine a quiet "pause and annotate" prompt card to cue her after each paragraph. Remind her to use the annotation guide column. (IEP 016-academics — "requires frequent reminders to utilize comprehension skills")
- **Partner Reading (Paragraphs 3–4):**
  - Pair Jasmine with a reliable peer. Provide the Turn & Talk sentence frames. Monitor for early disengagement; if Jasmine puts her head down, offer a scheduled break (see Section 6) before frustration escalates. (IEP 017-behavioral-social-emotional)
- **Whole-Class Reading — Paragraphs 5–7:**
  - Before this section, do a 60-second 1:1 check-in: "What do you understand so far about Lowe's definition? Put one idea in your annotation guide." (IEP 026-accommodations-and-modifications — "1:1 check ins")
- **Independent Practice — Multiple Choice + Short Response (20 min):**
  - Jasmine uses the pre-filled graphic organizer for the short response. She may use her annotation guide as a reference sheet.
  - Provide extended time as needed; allow the short response to be completed across the practice window and the discussion window if needed. (IEP 026-accommodations-and-modifications — "Extra time")
  - At the 10-minute mark, do a brief 1:1 check-in: read her claim sentence aloud back to her and ask, "Does this answer the prompt?" This mirrors the 1:1 support under which she currently works at grade level. (IEP 030-3-ela — "With 1:1 adult support, Jasmine can participate in writing activities at grade level")
- **Student-Led Discussion (5 min):**
  - Use the pre-loaded question strategy (Section 3). Pair Jasmine with a peer she has positive rapport with, capitalizing on the fact that she "gets along with her peers" and "loves to help others." (IEP 016-academics)

#### 5. Assessment — Alternative or Accommodated Check Aligned to the Lesson Objective

- **Primary accommodated check:** Jasmine submits the graphic organizer (claim / evidence / analysis) in place of the open-ended lined short response. Score using the same RI.2 rubric criteria, but with credit given for completing each labeled box accurately rather than requiring a fully formed paragraph. This assesses whether Jasmine can "answer literal and inferential comprehension questions" and "write a claim that accurately answers each part of the question" — her two core ELA benchmarks — without the additional barrier of paragraph-formatting demands. (IEP 030-3-ela "3 - ELA"; Lesson 007-4-how-do-paragraphs-5-7-help-the-reader-understand-the-autho)
- **Secondary check during reading:** Teacher collects Jasmine's two-column annotation guide at the end of class and notes: (a) whether she annotated at least two paragraphs, and (b) whether her annotations reflect accurate literal understanding of Lowe's definition. This is a direct progress data point toward the benchmark "Jasmine will be able to accurately annotate a given text for the prompt." (IEP 030-3-ela; Lesson 001-whole-class-reading-during-reading-questions)
- **Verbal check-in option:** If the written short response is incomplete, the teacher may ask Jasmine to orally explain what Lowe means by "identity-forming narrative" in one or two sentences during the 1:1 check-in, and record the response as a work sample. (IEP 016-academics — "open to feedback especially during 1-on-1 check-ins"; IEP 026-accommodations-and-modifications — "1:1 check ins")

#### 6. Accommodation Checklist

**Timing / Scheduling**

- [ ] Provide extended time on the Independent Practice short response; Jasmine may use the Student-Led Discussion window to finish if needed. (IEP 026-accommodations-and-modifications — "Extra time")
- [ ] Schedule a 1:1 check-in at the midpoint of Independent Practice (~10 min in) to redirect and affirm progress before frustration sets in. (IEP 026-accommodations-and-modifications — "1:1 check ins")

**Breaks**

- [ ] Offer a scheduled movement break between the Partner Reading phase and the Independent Practice phase (~20 min into class). (IEP 026-accommodations-and-modifications — "Frequent breaks," "Scheduled breaks")
- [ ] If Jasmine requests a restroom break during an academically demanding moment, offer the movement break alternative first (movement break = part of her self-regulation menu). (IEP 027-measurable-annual-goals)

**Environment / Seating**

- [ ] Seat Jasmine at the front of the room. (IEP 026-accommodations-and-modifications — "Sit in the front of the room")
- [ ] Position her near the teacher's primary circulation path to allow low-key proximity checks. (UDL)

**Directions / Presentation**

- [ ] Repeat directions verbally and provide a written copy (annotation guide and graphic organizer serve this function today). (IEP 026-accommodations-and-modifications — "Repeat directions")
- [ ] Pre-teach lesson vocabulary (Aspect, Moral, Narrative, Specific + "identity-forming," "normative") in a brief preview before the slide deck. (IEP 016-academics; Lesson 000-lesson-overview)
- [ ] Provide reference sheet: vocabulary definitions + sentence frames. (IEP 026-accommodations-and-modifications — "Reference sheets, graphic organizers and checklists")

**Reading**

- [ ] Provide annotated reading guide (two-column annotation scaffold) clipped to article. (IEP 016-academics — "requires frequent reminders to utilize comprehension skills such as tracking the text, annotating")
- [ ] Use asterisked (*) optional During Reading Questions for additional scaffolding. (Lesson 001-whole-class-reading-during-reading-questions)
- [ ] Provide teacher notes / copy of the teacher's answer guide for During Reading Questions A and C so Jasmine can self-check or use as a model. (IEP 026-accommodations-and-modifications — "Copy of teacher's notes")

**Writing**

- [ ] Substitute pre-structured graphic organizer (claim / evidence / analysis) for the open-ended short response format. (IEP 026-accommodations-and-modifications — "Reference sheets, graphic organizers and checklists"; IEP 030-3-ela)
- [ ] Accept oral response as a supplement or alternative to written output if stamina is depleted. (IEP 016-academics — "low reading and writing stamina")

**Behavior Regulation**

- [ ] Place self-regulation menu (sticky note: deep breathing, movement break, fidget tool, grounding) on desk at lesson start. (IEP 027-measurable-annual-goals — self-regulation annual goal)
- [ ] Use "pause, plan, proceed" verbal prompt if Jasmine begins to disengage (head down, off-task requests). (IEP 026-accommodations-and-modifications — "Reminders to pause, plan, proceed")
- [ ] Provide specific positive praise at each transition point (e.g., "I noticed you annotated paragraph 2 — that's exactly the goal"). (IEP 016-academics — "motivated by specific positive praise")
- [ ] If Jasmine shuts down, do not press for immediate re-engagement; offer the movement break first, then a 1:1 re-entry conversation before returning to the task. (IEP 017-behavioral-social-emotional; IEP 027-measurable-annual-goals)

---

## 5. What I'd like you to spot-check

If you're sanity-checking grounding (which I think is the right thing to evaluate):

1. Pick any `(IEP <id> "<title>")` citation above. Open `data/iep/sections/<id>.md`. Confirm the quoted phrase actually appears.
2. Pick any `(Lesson <id> "<title>")` citation. Open `data/lesson/sections/<id>.md`. Same check.
3. Look for `(UDL)`-only bullets. Confirm they're general best practice, not things that *should* have been cited to the IEP. (This is the most likely failure mode of the contract.)

The reason the contract has the `(UDL)` escape hatch at all is that without it, models either fabricate IEP citations to satisfy the rule or drop pedagogically reasonable bullets entirely. Letting them name a bullet as "general best practice not in the IEP" preserves honesty.

---

## 6. Trade-offs and what I'd change with more time

Calling these out because I'd rather be explicit about my own choices than have you discover them:

- **One lesson, one IEP.** The challenge explicitly endorses depth over breadth here, and that's what I optimized for. The architecture generalizes — point `DATA_DIR` at any folder with the same shape and it works — but I did not build the ingestion side of "a teacher uploads a new IEP." That's a district-pipeline concern in production, not an MCP-layer concern.
- **No teacher-facing UI.** The challenge mentions UI/UX as a question worth thinking through. I made a deliberate call to spend that time on the prompt contract and on chunking quality instead, because (a) Claude Desktop is a perfectly serviceable UI for the demo, and (b) the *output* is the artifact a teacher prints — making the output trustworthy is higher-leverage than wrapping it in a custom view. If we were building product I'd want to ship a thin web view that renders the six-section output with collapsible citation tooltips that fetch the cited section via the same MCP tools — that's a one-day project on top of this.
- **Search is substring, not semantic.** For a single committed lesson + single IEP, this is correct; a 20-section IEP doesn't need a vector index. For real classroom use across many IEPs you'd want embeddings on section bodies and a hybrid search tool. The interface (`search_lesson` / `search_iep`) is already there and would swap out cleanly.
- **The output contract is opinionated.** Six fixed sections, checkbox accommodation list, mandatory citations. A more generic system would let teachers pick the shape (table, narrative, etc.). I think for the v1 use case — "help me get tomorrow's lesson ready" — the opinionated shape is the feature, not a limitation. Happy to defend that call.
- **Prompt invocation footgun.** As called out in section 2, Claude Desktop's UI does not make it obvious that you have to click `+` to actually run an MCP prompt. The output contract assumes that invocation path. If we shipped this to teachers, I'd build a thin wrapper that calls the prompt programmatically so the host UI couldn't mis-route it.

---

## 7. File map (for quick navigation during review)

- `src/server.ts` — MCP server wiring (resources, tools, prompt). Start here.
- `src/differentiation.ts` — output contract + prompt body. The actual "intelligence" of the submission.
- `src/document-store.ts` — file-backed reader for normalized data.
- `src/paths.ts` — `DATA_DIR` resolution.
- `scripts/extract-sample-data.ts` — PDF → normalized Markdown dev script.
- `data/lesson/`, `data/iep/`, `data/context/udl-primer.md` — committed inputs.
- `tests/document-store.test.ts` — vitest suite.
- `README.md` — the canonical setup / general README (kept tidy for new readers).
- `README-challenge.md` — this file (reviewer-facing notes).

Thanks for reading. Happy to walk through any of the above on a call.
