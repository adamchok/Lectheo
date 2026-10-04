---
title: Lectheo Competitive Analysis
updated: 2026-10-04
tags: [lectheo, competition, research]
related: "[[Lectheo Product Spec]]"
---

# Lectheo Competitive Analysis

*Researched 4 Oct 2026 from each product's public website, help docs and press releases. "Not found" means the feature does not appear in public materials. It does not prove the feature is absent.*

Back to [[Lectheo Product Spec]].

---

## 1. Summary

- **The market is crowded at "record → notes → flashcards/quiz".** Turbo AI, Coconote (now owned by Quizlet), StudyFetch, Knowt, TikoNote, Genio and two apps already called "Lectio" all do this. Lectheo must not look like one more of them.
- **Each of Lectheo's pieces exists somewhere on its own:**
  - live "mark this moment" labels (Genio, Echo360)
  - concept maps (Algor, NotebookLM)
  - confidence-based assessment (Amplifire, enterprise only)
  - teach-to-an-AI (TeachBack, TikoNote, Feynman AI)
  - Socratic tutor modes (ChatGPT Study Mode, Gemini Guided Learning, Claude Learning mode, Khanmigo)
- **Nobody connects them.** No product found takes a student's *own live confusion signals*, diagnoses *overconfident misunderstanding*, and routes them into *reasoning practice grounded in that lecture* with a mastery rule that needs more than one kind of evidence. That chain is Lectheo's defensible position.
- **Two activities are first-of-their-kind *in AI lecture tools* (not new as pedagogy):** **Spot the flaw** (error-finding, with a separate judge) and **Stump the AI** (student-written question plus answer key, refereed). Error-finding is an established teaching technique, and **PeerWise** has had students write questions with answer keys for years. Neither appears in any AI lecture or study tool reviewed, though.
- 🚩 **Name collision (resolved).** Two lecture-recording AI study apps already used our original working name "Lectio": **lectioapp.it** and **lectio.tech**. **MaCom Lectio** (lectio.dk) is the Danish school-administration system. **Renamed to Lectheo on 4 Oct 2026.** See [[#6. Risks and implications for the spec|§6]].

---

## 2. Market map

| Segment | Players | What they sell | Threat to Lectheo |
|---|---|---|---|
| **A. AI lecture note takers** | Turbo AI, Coconote/Quizlet, StudyFetch, Knowt, TikoNote, Mindgrasp, Lectio (lectioapp.it), Lectio (lectio.tech) | Record or upload → notes, summaries, flashcards, quizzes, chat, podcasts, games | **High** for perception: judges and users will compare Lectheo to these first. |
| **B. Accessibility / institutional capture** | Genio Notes, Echo360 | Lecture capture with timestamped labels or confusion flags; sold to universities | **Medium.** Closest to live markers, but aimed at note organization (Genio) or instructor feedback (Echo360). |
| **C. Source-grounded AI notebooks** | NotebookLM (now also called Gemini Notebook) | Upload sources → mind maps, quizzes, flashcards, audio/video overviews, Learning Guide, Interactive Learning Overviews | **High**: free, powerful, and moving toward guided study sessions. |
| **D. General AI tutor modes** | ChatGPT Study Mode, Gemini Guided Learning, Claude Learning mode, Khanmigo | Socratic, step-by-step guidance instead of direct answers | **Medium.** Good pedagogy, but they don't know which lecture moments the student found confusing. |
| **E. Teach-back / Feynman apps** | TeachBack (tryteachback.app), TikoNote Feynman mode, Feynman AI | Explain a concept to AI "students" and get scored | **Medium for teach-back specifically.** This feature alone is not new. |
| **F. Concept-map generators** | Algor Education, NotebookLM Mind Maps | Turn material into concept or mind maps | **Low to medium.** Maps summarize content but don't track a student's mastery. |
| **G. Confidence-based learning** | Amplifire | Patented "Confidence-Based Learning" for corporate and healthcare training | **Low** as a direct competitor (enterprise), but it shows confidence ratings work and owns trademarks we must avoid. |

---

## 3. Competitor profiles

### Genio Notes (formerly Glean)
- **What:** Note-taking and lecture-recording tool "rooted in learning science". Audio recording, live captions in many languages (institutional plans), **quick notes and labels time-stamped to the recording**, slide import, Scribble handwriting, OCR, transcription with speaker identification, AI Outline linked to moments, Provided Study Notes (e.g. Cornell format), **Quiz Me** (AI multiple choice), Focus Timer, Chrome extension.
- **Who / how sold:** Higher-ed students, especially through disability and accessibility services. Over 1,000 institutions. Department and institution-wide licenses, plus individual free trial and paid plans.
- **Overlap with Lectheo:** Live time-stamped labels during lecture. Slides and OCR. Quizzes from lecture content.
- **Gap:** Labels organize notes. They don't drive diagnosis. Quizzes are recall-style multiple choice. No confidence rating, concept map, mastery tracking or reasoning activities.
- **Takeaway:** Proves that marking moments during class is a real, accepted habit. It also means **"tap to mark" alone is not new**.

### Echo360 (Confusion Flags)
- **What:** Institutional lecture-capture platform. Students click a **Confusion Flag** on a slide or a time-stamped scene during or after the lecture, plus personal bookmarks.
- **Gap:** Flags go to the **instructor** as a tally. Nothing turns them into personal diagnosis or practice. Only available if the university licenses Echo360.
- **Takeaway:** Supports our "I'm lost" marker as an established idea. Lectheo turns the same signal into *student-side* learning.

### Turbo AI (formerly TurboLearn AI)
- **What:** "The fastest way to learn anything." Upload lectures, PDFs, YouTube or notes, or record live → notes, quizzes, flashcards, podcasts, chatbot, premade AP study guides, collaborative docs. Claims over 10 million learners and a 4.8★ rating from 300k+ reviews. Free tier, paid from about $10–12 per month (third-party pricing sites).
- **Gap:** The same content for every student. Recall-focused (cloze, multiple choice, short "describe" prompts). No personal confusion signal, confidence rating or reasoning-graded activities.
- **Takeaway:** The baseline judges will compare Lectheo against. Lectheo's demo must show **personal diagnosis in the first minute**.

### Coconote (owned by Quizlet since Feb 2026)
- **What:** AI note taker on iOS, Android, web and Mac. Record or upload anything → notes, transcripts, AI chat, quizzes, flashcards, study games, AI podcasts, 100+ languages. Quizlet bought it to cover audio capture in its "capture → practice → retention" platform. Quizlet itself has 60 million+ users and an AI study experience.
- **Gap:** Same recall pattern. Quizlet's strength is retention (flashcards, spaced practice), not diagnosing understanding.
- **Takeaway:** **Biggest incumbent threat by distribution.** Quizlet now owns lecture capture through to practice. Lectheo's angle is **understanding, not retention**.

### StudyFetch
- **What:** "Learning that adapts to you." AI tutor "Sparky", **Live Lecture** (real-time transcription with tips during class, then "Enhance Notes" and "Turn Into" flashcards, practice tests or podcasts), Tutor Me, Study Plan, Arcade games, Essay Grader, explainer videos, "Call with Sparky". Claims 8M+ users and 1,000+ universities. Building a "Learn Engine" for personalized learning paths.
- **Gap:** Personalizes by materials and deadlines, not by moments the student flagged. Practice is quizzes, tests and games. No confidence calibration or adversarial reasoning activities found.
- **Takeaway:** Most feature-rich consumer competitor and heading toward "adaptive". Expect it to add diagnostics over time. Lectheo's edge is **the marker → diagnosis → reasoning chain**.

### Knowt
- **What:** Free Quizlet alternative. AI lecture note taker, PDF and video summariser, flashcards with learn mode and spaced repetition, practice tests, **free-response practice with automatic grading** (AP FRQs), large shared library. Claims 8.6M users and strong AP high-school reach.
- **Gap:** Recall and exam-prep focus. High-school AP is its core market.
- **Takeaway:** Automatic free-response grading is becoming normal. Lectheo's grading has to be visibly *rubric-based and consistent* to stand out.

### TikoNote
- **What:** PDF, slide, audio or video → notes, flashcards, quizzes, mind maps, AI tutor. **Feynman Technique mode:** voice-first, explain out loud to an AI student, "jargon detection", follow-up questions, real-time **Understanding Score**. Also "blurting" practice and choose-your-audience explanations. Paid plans about $49.99/yr or $12.99/mo.
- **Takeaway:** A direct overlap with **teach-back + personas**. Lectheo's teach-back must be *grounded in the student's lecture* and *triggered by diagnosis*, not a standalone feature.

### TeachBack (tryteachback.app) and Feynman AI
- **What:** Upload notes → "step into the classroom" and teach AI students with different personalities ("eager overachiever", "skeptic"). Scores for clarity, accuracy and completeness. Voice or text. **XP, ranks (Novice → Grandmaster), quests, streaks.**
- **Takeaway:** Persona-based teach-back is already a product category. Lectheo's deliberate choice of **no XP or leaderboards** sets it apart. Pitch teach-back as one of several kinds of evidence, not the headline.

### NotebookLM (now also called Gemini Notebook)
- **What:** Google's source-grounded notebook. Chat with citations, **Mind Maps**, flashcards and quizzes (with explanations that cite sources), study guides and reports, Audio and Video Overviews, **Learning Guide** (tutor-style probing questions), and since Sept 2026 **Interactive Learning Overviews**: guided walkthroughs mixing explanations with quizzes and flashcards. Free, with more in Google AI Pro (free for students in several countries).
- **Gap:** No live capture and no personal markers. Works from uploaded documents. Mind maps summarize content but don't show the student's mastery. No confidence calibration or adversarial activities found.
- **Takeaway:** **The most serious "why not just use X?" question.** It is free, strong, and now builds study sessions. Answer: *NotebookLM knows your sources. Lectheo knows your confusion.*

### General AI tutor modes: ChatGPT Study Mode, Gemini Guided Learning, Claude Learning mode, Khanmigo
- **What:** Socratic guidance, hints and knowledge checks instead of direct answers.
  - ChatGPT Study Mode (Jul 2025): interactive prompts, scaffolded responses, personalized level, knowledge checks.
  - Gemini Guided Learning (Aug 2025): step-by-step explanations with visuals, flashcards from quiz results.
  - Claude Learning mode (Apr 2025, in Claude for Education): guiding instead of answering, Socratic questions.
  - Khanmigo: never gives the answer; $4/mo for learners; gamified "energy points" and hats.
- **Gap:** General purpose. They don't know which lecture or moment confused this student. Chat personas can be talked into accepting wrong answers.
- **Takeaway:** Socratic feedback is **table stakes**, not a differentiator. Lectheo's edge is *grounding plus a separate judge with a fixed rubric*.

### Algor Education
- **What:** AI concept maps, mind maps, flashcards, quizzes and study notes from any material. Templates. Claims 4–6M learners and 200+ schools. Strong in accessibility and visual learning.
- **Gap:** Maps are a study aid, not a progress tracker tied to diagnosis.
- **Takeaway:** Concept maps alone are not new. Lectheo's map matters because it is a **mastery map** (gray/red/amber/green) with the student's markers on it.

### Amplifire
- **What:** Enterprise "Confidence-Based Learning®" platform (healthcare, corporate, public sector, some education). Learners rate confidence on each answer to find **"Confidently Held Misinformation™"**. Distractors are written to expose misconceptions.
- **Takeaway:** Strong support for our confidence-before-answering design, and for building distractors from misconceptions. **Avoid their trademarked terms.** Use plain phrases like "overconfident and wrong" or "confident mistakes".

### Lectio (lectioapp.it) and Lectio (lectio.tech): same-name competitors
- **lectioapp.it:** Desktop app (Mac/Windows) for university students. "Record the lecture. Lectio does the rest." Local transcription, AI summaries (Gemini), quizzes, handouts, chat across courses. Free plus Pro.
- **lectio.tech:** French-language web app. Transcription → structured PDF notes (table of contents, key points, glossary), flashcards with spaced repetition, quizzes, chat, Notion export. Free, or €12/mo / €99/yr.
- **Takeaway:** Both are standard "record → notes → quiz" products in the same category and under **the same name**. See [[#6. Risks and implications for the spec|§6]].

---

## 4. Feature comparison

✓ = clearly offered · ◐ = partial or similar · — = not found in public materials

| Capability | **Lectheo** | Genio | Echo360 | Turbo AI | Coconote | StudyFetch | Knowt | NotebookLM | TikoNote | TeachBack | AI tutor modes | Algor | Amplifire |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Live lecture recording | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ◐ | — | — | — | — |
| **Live personal markers** (lost / important) | ✓ | ◐ labels | ◐ flags → instructor | — | — | — | — | — | — | — | — | — | — |
| Photos / slides as input | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Concept map of lecture | ✓ | — | — | — | — | — | — | ◐ mind map | ◐ mind map | — | — | ✓ | — |
| Map linked across lectures in a course | ✓ | — | — | — | — | — | — | ◐ | — | — | — | — | — |
| **Confidence rated before answering** | ✓ | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| Distractors built from misconceptions | ✓ | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| Practice prioritized by diagnosis | ✓ | — | — | — | — | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | — | ✓ |
| Teach-back to AI persona | ✓ | — | — | — | — | ◐ | — | — | ✓ | ✓ | ◐ | — | — |
| Transfer problems (new scenario) | ✓ | — | — | — | — | ◐ | — | ◐ | — | — | ◐ | — | — |
| **Spot the flaw** with separate judge | ✓ | — | — | — | — | — | — | — | — | — | — | — | — |
| **Student writes question + key (Stump the AI)** *(PeerWise does this without AI)* | ✓ | — | — | — | — | — | — | — | — | — | — | — | — |
| Socratic hints, cites lecture moment | ✓ | — | — | — | — | ◐ | — | ◐ cites sources | ◐ | — | ◐ no lecture link | — | — |
| **Mastery needs 2+ activity types** | ✓ | — | — | — | — | — | — | — | — | — | — | — | — |
| No XP / leaderboard gamification | ✓ | ✓ | ✓ | — games | — games | — Arcade | ◐ | ✓ | ✓ | — XP, ranks | — (Khanmigo points) | ✓ | ✓ |
| Flashcards / spaced repetition | — (by design) | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | ◐ |

---

## 5. Where Lectheo wins: positioning

### Unoccupied space
**Personal confusion signal → calibrated diagnosis → reasoning practice → multi-evidence mastery**, all grounded in the student's own lecture. Each competitor covers one or two links in this chain. None found covers the whole chain. This is **defensible for now, not a moat**: it's a workflow, and a large player (e.g. NotebookLM) could add confidence ratings quickly. Speed and execution matter.

### Positioning lines
- *Other apps turn your lecture into notes. Lectheo turns it into a diagnosis.*
- *NotebookLM knows your sources. Lectheo knows your confusion.*
- *Flashcards check what you remember. Lectheo checks whether you can use it.*

### What *not* to lead with (already common)
- "AI notes / summaries / flashcards from your lecture." Everyone does this.
- "Socratic AI tutor." ChatGPT, Gemini, Claude and Khanmigo all have one.
- "Teach the AI." TeachBack and TikoNote own this pitch.
- "Concept map from your notes." Algor and NotebookLM do this.

### What *to* lead with
1. **"I'm lost" markers that drive what you practice**, captured live or while first watching a recorded lecture. Genio and Echo360 capture the signal but don't act on it.
2. **Confident-but-wrong detection.** A proven idea from enterprise training (Amplifire) that consumer study apps haven't adopted.
3. **Spot the flaw (main activity) and Stump the AI (beta).** Established techniques (error-finding; student-generated questions as in PeerWise), but **first in an AI lecture tool**, with independent verification and fixed-rubric judging. Both test critical evaluation and question generation, the top of the "apply and analyze" scale.
4. **Green means proven two ways.** A stricter, more honest mastery signal than "you got the quiz right".

---

## 6. Risks and implications for the spec

| Finding | Implication |
|---|---|
| 🚩 Two AI lecture apps are already called **Lectio** (lectioapp.it, lectio.tech), plus **MaCom Lectio** (lectio.dk) in Denmark. | **Resolved: renamed to Lectheo** (4 Oct 2026; lectheo.com and github.com/lectheo were free when checked). Remaining risk: search engines may correct "Lectheo" to Lecto, LectO or Lectio, so always write "Lectheo (LEK-thee-oh)". See [[Lectheo Product Spec#10. Open product questions]]. |
| Live labels and confusion flags already exist (Genio, Echo360). | Don't claim markers are new. Claim that **markers drive diagnosis and practice**. |
| Teach-back with personas is crowded (TeachBack, TikoNote). Student-authored questions exist (PeerWise). | Keep teach-back, but present it as **one of several kinds of evidence**, grounded in the lecture and prioritized by diagnosis. |
| NotebookLM is free, cites sources, and now builds guided study sessions. | The demo must show something NotebookLM can't: **personal markers and confident mistakes** within about a minute. |
| Quizlet + Coconote now covers capture through to practice at huge scale. | Position on **understanding, not retention**. Leave out flashcards and spaced repetition on purpose. |
| Amplifire trademarks "Confidence-Based Learning®" and "Confidently Held Misinformation™". | Use our own wording: "confident mistakes", "overconfident and wrong". |
| Competitors heavily gamify (Turbo, Coconote, StudyFetch Arcade, TeachBack XP, Khanmigo points). | Our **light gamification** is a real differentiator. Say it explicitly. |
| Automatic free-text grading is becoming common (Knowt FRQ, TeachBack scores, TikoNote Understanding Score). | Our grading must be **consistent, rubric-based and visible** to stand out. |

---

## Sources

- Genio Notes: [genio.co/notes](https://genio.co/notes), [pricing](https://genio.co/pricing/institutions)
- Echo360 Confusion Flags: [support.echo360.com](https://support.echo360.com/hc/en-us/articles/11077695519885-EchoVideo-Flagging-and-Bookmarking-Content), [echo360.com blog](https://echo360.com/blog-use-confusion-alerts-to-review-teaching-delivery/)
- Turbo AI: [turbo.ai](https://www.turbo.ai/); pricing via [toolmango.com](https://toolmango.com/tools/turbolearn-ai/pricing)
- Coconote: [coconote.app](https://coconote.app/); Quizlet acquisition: [PR Newswire, 5 Feb 2026](https://www.prnewswire.com/news-releases/quizlet-supercharges-studying-with-new-product-innovations-and-strategic-acquisition-302679622.html)
- StudyFetch: [studyfetch.com](https://www.studyfetch.com/), [Live Lecture](https://www.studyfetch.com/features/live-lecture)
- Knowt: [knowt.com](https://knowt.com/)
- TikoNote: [tikonote.app](https://tikonote.app/en/), [Feynman feature](https://tikonote.app/en/features/feynman-technique/)
- TeachBack: [tryteachback.app](https://tryteachback.app/)
- NotebookLM: [Google blog – student features](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/), [XDA – Interactive Learning Overviews, 28 Sep 2026](https://www.xda-developers.com/tested-notebooklms-new-interactive-learning-overviews-fixed-biggest-problem/)
- ChatGPT Study Mode: [openai.com](https://openai.com/index/chatgpt-study-mode/)
- Gemini Guided Learning: [Google blog](https://blog.google/products/gemini/new-gemini-tools-students-august-2025/)
- Claude Learning mode: [anthropic.com](https://www.anthropic.com/news/introducing-claude-for-education)
- Khanmigo: [khanmigo.ai/learners](https://www.khanmigo.ai/learners)
- Algor Education: [algoreducation.com](https://www.algoreducation.com/en)
- Amplifire: [Confidence-Based Learning platform](https://amplifire.com/confidence-based-learning-platform/)
- PeerWise (student-authored questions): [peerwise.cs.auckland.ac.nz](https://peerwise.cs.auckland.ac.nz/)
- Name collisions: [lectioapp.it](https://www.lectioapp.it/), [lectio.tech](https://lectio.tech/en), [lectio.dk](https://www.lectio.dk)
- Market roundup: [scriptbyai.com](https://www.scriptbyai.com/best-ai-lecture-note-takers-students/)
