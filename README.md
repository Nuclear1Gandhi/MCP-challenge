# Waypoint Learning: The Special Education Challenge

Build an MCP server that helps a teacher differentiate instruction for a student with an Individualized Education Program (IEP).

**Prize:** $500 to the winner. Top 5 submissions get an immediate final-round interview for the founding engineer role at Waypoint Learning The challenge is designed to take no more than a few hours.

**Deadline:** Monday, May 11 @ 12pm ET

---

## The Challenge

Almost 10 million U.S. students have IEPs — legally binding documents that describe exactly what a student needs in the classroom every day. But teachers can't act on them well, because translating a 20+ page IEP into a modified version of tomorrow's lesson takes hours of prep they don't have.

Your job: build an MCP server that gives Claude the context it needs to help a teacher do this in minutes instead of hours.

Given a lesson and a student's IEP, the system should produce **specific, actionable instructional modifications** — scaffolded questions, modified materials, alternative assessments, accommodation reminders. Things a teacher can actually use in the classroom.

## What's in This Repo

Original PDFs at repo root (`lesson.pdf`, `iep`). Extracted, chunked Markdown and manifests live under [`data/lesson/`](data/lesson/) and [`data/iep/`](data/iep/) after running `npm run extract-data`.

Source for the MCP server: [`src/server.ts`](src/server.ts) plus [`src/document-store.ts`](src/document-store.ts).

## What You'll Build

An MCP server (TypeScript or Python) that:

1. Exposes the curriculum and IEP data to Claude as resources and/or tools
2. Lets Claude reason about the intersection of a specific lesson and a specific student's needs
3. Produces concrete modifications a teacher can use without further editing

The architecture is up to you. Some questions worth thinking through:

- How do you chunk and surface the IEP so Claude can reason about goals, accommodations, and present levels effectively?
- How do you ground modifications in *both* the curriculum and the IEP, rather than producing generic strategies?
- What does the teacher actually see and how to they easily navigate the UI/UX of the tool? 

Feel free to research Universal Design for Learning (UDL) and other pedagogical frameworks. The ability to learn quickly is part of what we're evaluating.

This is intentionally open-ended. There's no single "right" architecture. We want to see how you think about structuring domain data for an LLM: what becomes a resource, what becomes a tool, how you handle context, and whether the output is actually useful to a teacher. A thoughtful, well-structured solution that handles one lesson well is better than a sprawling system that handles many lessons poorly.

## Getting Started

### Prerequisites

- Node.js 18+ (for TypeScript) **or** Python 3.10+ (for Python)
- An Anthropic API key or Claude Desktop installed
- Familiarity with the [Model Context Protocol]

### Setup

```bash
git clone https://github.com/igoldstein19/waypoint-challenge.git
cd waypoint-challenge
```

---

## MCP server implementation (this submission)

### Prerequisites

- Node.js 18+
- Claude Desktop, Cursor, or another MCP host that can launch a local stdio server

### Install and run

```bash
npm install
npm run build
npm start
```

Development (no build step): `npm run dev`

The server speaks MCP over **stdio**. Log only to **stderr** if you fork the code; stdout/stdin carry protocol traffic.

Optional environment variable:

- `DATA_DIR` — absolute path to a folder with the same layout as [`data/`](data/) (defaults to `./data` from the process working directory).

### Normalizing PDFs to `data/`

Sample inputs ship as PDFs at the repo root (`lesson.pdf`, `iep`). A dev-only script extracts text and writes chunked Markdown plus manifests:

```bash
npm run extract-data
```

The running MCP server reads **committed extracted files** only — not PDFs — so tests stay deterministic and deployment stays simple.

### Claude Desktop (example)

Point `command` at the built entry and set `cwd` to this repository:

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

Adjust `cwd` / use absolute paths on your machine. After restarting Claude Desktop, enable the server and ask the model to list resources or call tools such as `list_iep_sections`.

### Architecture decisions

| Piece | Role |
| --- | --- |
| **`data/lesson`, `data/iep`** | Normalized Markdown + `*.manifest.json` listing `{ id, title }` per chunk; `sections/*.md` holds one file per id. Chunking uses PDF heading heuristics so sections align with visible structure rather than arbitrary token splits. |
| **Resources** | Stable URIs for discovery: `lesson://document`, `iep://document`, `context://udl-primer`, plus URI templates `lesson://section/{sectionId}` and `iep://section/{sectionId}` with list + completion support. Full documents satisfy “what exists?”; templates enumerate slice URIs for selective reads. |
| **Tools** | `list_*`, `get_*`, `search_*` let the host pull **exact excerpts** without pasting entire PDFs into chat — encouraging grounding in both lesson and IEP. |
| **Prompt `differentiate_for_iep_student`** | Bundles the canonical output scaffold (lesson anchor → accommodations checklist) and explicit grounding rules in [`src/differentiation.ts`](src/differentiation.ts). |
| **`context://udl-primer`** | Short UDL-oriented reminders authored for this repo (not copied from proprietary curriculum). |

**Trade-offs:** Full-text resources are easy to audit; tools add a second path so models fetch smaller slices and cite section ids. This challenge stays MCP-only (no upload API); a production system would ingest arbitrary lessons/IEPs through district pipelines before exposing similar URIs.

### Prompt and output shape

The registered prompt and `DIFFERENTIATION_PROMPT_BODY` enforce a strict Markdown-only contract:

- Output Markdown only (no HTML).
- Output exactly these six top-level headings, in order (and nothing else):
  - `## Lesson anchor`
  - `## Student-linked needs (with IEP citations)`
  - `## Scaffolds`
  - `## Materials and procedures`
  - `## Assessment`
  - `## Accommodation checklist`
- Under each heading, use bullet points.
- Each bullet includes at least one citation to lesson/IEP text using:
  - `(Lesson <sectionId> “<sectionTitle>”)`
  - `(IEP <sectionId> “<sectionTitle>”)`
  Or ends with `(UDL)` if it is general best practice not explicitly stated in the IEP.

### Tests

```bash
npm test
```

Unit tests cover manifest loading, section reads, and search helpers against the committed `data/` fixtures.

### Example outputs (illustrative)

The host model should fill these using **your** `lesson` / `IEP` excerpts; the samples below show form only.

**Example A — exit ticket (abbreviated)**

1. **Lesson anchor** — Grade 4 fractions exit ticket (denominators 2–12).  
2. **Student-linked needs** — *Processing speed / working memory* (cite the **Academics** / present-level statements from the IEP resources); *Attention* (cite the **Accommodations** or services section as listed in the IEP).  
3. **Scaffolds** — Provide a completed worked example matching the exit ticket format; offer sentence frames (“The fraction greater than ½ is ___ because ___”).  
4. **Materials and procedures** — Cut exit ticket to **two** items; allow oral justification recorded by peer or teacher; keep manipulatives available from the lesson launch.  
5. **Assessment** — Accept a labeled constructed response or drawn representation instead of full sentences if objectives are met.  
6. **Accommodation checklist** — Preferential seating near model; quiet corner option; extended time where the IEP specifies; directions repeated once in shortened form.

**Example B — vocabulary launch**

1. **Lesson anchor** — Academic vocabulary introduction for the unit launch.  
2. **Student-linked needs** — *Language* goals (cite the student’s **Academics** or communication goals in the IEP); *Sensory* or *environment* supports (cite the listed accommodations that apply to small-group noise).  
3. **Scaffolds** — Pre-teach three high-utility roots using a visual grid; choral repetition before partner talk.  
4. **Materials and procedures** — Provide vocabulary cards with image + student-friendly definition prior to whole-class reading; pair student with “word coach” peer for three minutes.  
5. **Assessment** — Sort terms into “know / sort-of / new” instead of a timed written quiz.  
6. **Accommodation checklist** — Advance organizer printed; noise-reducing headphones optional during independent sort.

## Evaluation Criteria

We'll evaluate submissions on four dimensions:

| Dimension | What we're looking for |
|---|---|
| **Output quality** | Are the instructional modifications specific, actionable, and grounded in both the curriculum and the IEP? Would a real teacher use this? |
| **Architecture decisions** | How did you structure curriculum and IEP data for Claude? What trade-offs did you make and why? Your README should explain this. |
| **Code quality** | Clean, readable, well-organized. Comments where they matter. Tests if you have time. |
| **Domain understanding** | Does the solution reflect real thinking about what a teacher needs, not just what's technically interesting? How did you provide additional context that increased the quality of output? |

## How to Submit

1. Push your code to a **public GitHub repo**
2. Include a README that:
   - Explains how to run your server
   - Walks through your architecture decisions
   - Shows 1-2 example outputs (lesson + IEP → modifications)
3. Email **isaac@waypoint-learning.org** with:
   - Subject: `Waypoint Challenge: [Your Name]`
   - A link to your repo
   - (Optional) A short demo video

**Deadline: Monday, May 11 @ 12pm ET.** Late submissions won't be considered.

## FAQ

**Can I use models other than Claude?**
Yes, feel free.

**Can I team up?**
Solo submissions only for this round.

**What if it's taking too long?**
A focused, partial solution with clear thinking beats nothing.

**Can I use additional libraries / RAG / fine-tuning / etc.?**
Yes. Use whatever helps you build the best solution.

**I have a question that isn't here.**
Comment in HN or email isaac@waypoint-learning.org.

## A Note on the Data

Please don't redistribute these materials outside the context of this challenge.

## About the Role

We're looking for a founding engineer who wants to build the technical foundation of a company that could genuinely change how millions of students experience school. You'd be working directly with me (Isaac) to go from MVP to full product.

The work involves building AI-powered tools for teachers — ingesting and understanding curriculum, reasoning about IEPs, generating actionable instructional modifications, automating reporting workflows, and creating tight feedback loops so teachers know what's working. The stack is early and flexible.

This role is ideal for a strong engineer who wants massive ownership, cares about education, and is excited about building with LLMs in a domain where the work genuinely matters.

## About Waypoint Learning

Waypoint is building AI tools that help teachers serve students with disabilities by both streamlining administrative work and supporting fundamentally better instruction. We believe the highest-leverage point in education is the teacher, and the hardest thing teachers do is differentiate instruction for students with diverse learning needs.

Founder & CEO: Isaac Goldstein studied CS at Stanford and is finishing is MBA at Harvard. He hasive years in education at EY-Parthenon, BCG, and Great Minds, where he led a 330-person curriculum implementation team - and he's looking to partner with a great engineer to build a very impactful business.
