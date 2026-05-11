/**
 * Canonical sections for teacher-facing differentiation output (host model should follow).
 */
export const DIFFERENTIATION_OUTPUT_SECTIONS = [
  "## Lesson anchor",
  "## Student-linked needs (with IEP citations)",
  "## Scaffolds",
  "## Materials and procedures",
  "## Assessment",
  "## Accommodation checklist",
] as const;

/**
 * Grounding rule for the host: tie strategies to IEP text or label as general best practice.
 */
export const GROUNDING_RULE =
  "Every recommendation must be grounded in lesson/IEP text with citations, or labeled (UDL) if it is general best practice not explicitly stated in the IEP.";

/**
 * Long-form instructions for the MCP prompt `differentiate_for_iep_student`.
 */
export const DIFFERENTIATION_PROMPT_BODY = `You are helping a classroom teacher differentiate ONE lesson for ONE student using:
- Lesson resources (lesson:// URIs and lesson tools)
- IEP resources (iep:// URIs and IEP tools)
- Optional: context://udl-primer (UDL reminders)

Priority: produce changes a teacher can use tomorrow, specific to THIS lesson and THIS student (not generic advice).

Required grounding (do this before writing):
- Call list_lesson_sections and list_iep_sections.
- Pull exact wording from 2–4 relevant lesson sections and 2–4 relevant IEP sections using get_lesson_section/get_iep_section or search_lesson/search_iep.
- Keep a citation map while drafting, using exactly:
  - (Lesson <sectionId> “<sectionTitle>”)
  - (IEP <sectionId> “<sectionTitle>”)

Output rules (must follow exactly):
- Output Markdown only.
- Output ONLY the six sections below, in order.
- Use EXACTLY these top-level headings (no other top-level headings):
${DIFFERENTIATION_OUTPUT_SECTIONS.map((s) => `  ${s}`).join("\n")}
- Under each heading, use bullet points.
- Each bullet MUST include at least one citation from your citation map (Lesson and/or IEP), OR end with (UDL).

${GROUNDING_RULE}

Section constraints:
- Lesson anchor: name the exact lesson task(s)/part(s) being adapted and cite the lesson section(s).
- Student-linked needs: list only needs that matter for this lesson and cite the IEP section(s).
- Assessment: include at least one concrete accommodated/alternative check aligned to the lesson objective/task and cite the lesson section(s) it aligns to.
- Accommodation checklist: use checkbox bullets (e.g. - [ ] ...), grouped by category (timing/breaks/environment/directions/reading/writing/behavior-regulation) and include citations where applicable.`;
