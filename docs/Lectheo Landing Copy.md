---
title: Lectheo Landing Copy
updated: 2026-10-06
version: final 1
tags:
  - lectheo
  - landing
  - copy
related:
  - "[[Lectheo Design System]]"
  - "[[Lectheo Product Spec]]"
  - "[[Lectheo Competition]]"
---

# Lectheo Landing Copy

The words for the public landing page at `/`. Layout, tokens and section rules are in [[Lectheo Design System#5. Landing page]]; this file is only the copy, in page order. Claims were checked against the product on 6 Oct 2026. Lines marked *ship when …* describe decided features: leave them out until that feature is live. If the product changes, change the copy.

**Voice:** calm, precise, a little academic. Sentence case. No hype words, no emoji, no exclamation marks. Speak to one student ("you"). Use the product's words: "I'm lost", "Important", "confident mistake", "Spot the flaw", "Teach-back", "Transfer", "Stump the AI", "Mastered".

---

## Metadata

- **Title:** Lectheo · Find what you missed. Prove what you know.
- **Description (155 chars max):** Lectheo finds what you personally don't understand in a lecture, then makes you reason with it. Confidence-rated diagnosis and practice for CS students.
- **OG image text:** Find what you missed. Prove what you know. + wordmark.

---

## Header

- Wordmark: **Lectheo** (pronunciation shown once in the hero, not in the header)
- Nav: How it works · Practice · Why Lectheo · FAQ
- Buttons: **Sign in** (ghost) · **Try the sample account** (primary)

---

## 1. Hero

**Eyebrow:** For CS students who learn from lectures

**Headline:** Find what you missed. *Prove* what you know.

**Lead:** Mark the moments you get lost. Lectheo turns them into a short diagnosis of what you actually misunderstand, then makes you reason with those ideas until you can show you know them.

**Primary button:** Try the sample account
**Secondary button:** Continue with Google

**Trust line (caption):** No sign-up for the sample. It's a student partway through Harvard's CS50x, and it's deleted after 24 hours.

**Pronunciation (caption, under the trust line):** Lectheo is said LEK-thee-oh.

**Image:** the course map with one red "Confident mistake" node and its flag. Alt text: "A concept map of a CS50 lecture. Hash tables is marked Needs work with a confident mistake; arrays and linked lists are Mastered."

---

## 2. The problem (no eyebrow)

**Title:** Rewatching doesn't tell you what you got wrong.

**Lead:** After a lecture you know which parts felt hard. You don't know which ideas you've quietly misunderstood, because those feel fine. Notes and flashcards repeat the lecture back to you. They can't find the mistake you're sure isn't one.

---

## 3. How it works

**Eyebrow:** How it works
**Title:** From "I'm lost" to proven, in four steps.

1. **Mark while you watch.**
   Press **L** when you're lost and **I** when something matters. No pausing, no notes. Your marks sit on the lecture's timeline.
2. **See the lecture as a map.**
   Lectheo builds a concept map of the lecture and shows how ideas depend on each other. Your marks land on the concepts they belong to, so confusion is traced back to where it started.
3. **Get a diagnosis, not a quiz.**
   A short diagnostic asks how sure you are *before* you see the options. Sure and wrong, twice, is a **confident mistake**: the gap you didn't feel. Each result links to the moment in the lecture that explains it.
4. **Practice until it's proven.**
   Lectheo picks what to practice from your diagnosis. A concept turns **Mastered** only when you've shown it on your own, in two different kinds of activity.

---

## 4. Diagnosis spotlight

**Eyebrow:** Diagnosis
**Title:** The mistakes you're sure about matter most.

**Lead:** Getting something wrong when you guessed is normal. Getting it wrong when you were sure means you'll keep getting it wrong, in the exam too. Lectheo asks for your confidence first, follows up on sure-but-wrong answers with a second question on the same idea where it can, and flags a confident mistake when you're sure and wrong.

**Points (three short lines, icon + text):**
- Confidence before options, so you can't adjust after seeing them.
- A follow-up on the same idea where possible, so one slip isn't treated as a misconception.
- Every answer explained, with a link to the lecture moment.

**Image:** a diagnostic result card showing "Confident mistake: hash table lookup cost" with its lecture link.

---

## 5. Practice

**Eyebrow:** Practice
**Title:** Four ways to use an idea, not just recall it.

**Lead:** Each activity makes you reason. You get a guiding question and a second try before the answer is shown.

| Card | What you do | What it proves |
|---|---|---|
| **Spot the flaw** | Read a short explanation written by an AI "author" who believes it's right. Question them, find the flawed sentence and correct it. Some explanations have no flaw. | You can judge an explanation, not just repeat one. |
| **Teach-back** | Explain the idea to Sam, a curious first-year who asks follow-up questions. | You can explain it clearly and completely. |
| **Transfer** | Solve a problem the lecture never covered that needs the same idea. | You can apply it somewhere new. |
| **Stump the AI** · Beta | Write a hard question and your own answer key. A referee checks it's fair; then the AI tries to answer. | You understand it well enough to test someone else. |

**Footnote (caption):** The AI author never sees the flaw it's hiding, and its replies are checked so it can't give the answer away.

---

## 6. Mastery

**Eyebrow:** Mastery
**Title:** Green means you showed it. Twice.

**Lead:** Most apps mark a topic done after one right answer. In Lectheo a concept is **Mastered** only after two independent correct answers in two different activity types. Hints or a revealed explanation don't count as independent. If your last attempt was wrong, the concept goes back to Needs work.

**States row (badge + one line each):**
- **Not tested** — you haven't been asked yet.
- **Needs work** — your last answer was wrong, or you have a confident mistake.
- **Getting there** — you've shown part of it.
- **Mastered** — shown on your own, two different ways.

**Caption:** No points, no streaks, no badges. Just what you understand.

---

## 7. Why Lectheo (trust)

**Eyebrow:** Why Lectheo
**Title:** Built to be right before it's clever.

Three columns:

1. **Checked before you see it.**
   Every question is solved blind by a second AI model, from a different company than the one that wrote it. Questions that don't check out are rewritten or dropped.
2. **Graded against a fixed rubric.**
   Answers are marked against criteria written before you start, by a separate judge, not the character you're talking to. Whatever can be checked exactly, like which sentence holds the flaw, is checked in code.
3. **Always tied to the lecture.**
   Every concept, question and piece of feedback links to the moment in the lecture it came from (when the transcript has timestamps), so you can check it yourself.

---

## 8. Your lectures

**Eyebrow:** Your lectures
**Title:** Try it on CS50, then bring your own.

**Lead:** The sample account comes with Harvard's CS50x Lectures 3, 4 and 5, ready to watch and practice. A Google account starts empty and is yours alone. Add your own lectures:

- **A recording with its transcript.** Pick the video or audio file and its `.vtt` or `.srt` captions (Teams, Zoom and Panopto can export them). The video plays from your laptop and is never uploaded.
- **Audio only.** Upload the audio; Lectheo transcribes it, then deletes the audio.
- **A transcript.** Paste or upload the text. Without timestamps you can't mark moments, but you still get the map, the diagnosis and practice.

*Ship when YouTube lectures (F10) are live: add a bullet "**A YouTube video.** Paste the link. It plays through YouTube, and Lectheo builds the map from its transcript."*

*Ship when Study mode (F9) is live: in the hero lead and How it works step 1, change "Mark while you watch" to "Read the brief or watch. Mark what's unclear.", and add the FAQ "Do I have to watch the whole lecture?" → "No. Study the brief in a few minutes, watch only the parts you got stuck on, then get tested."*

**Caption:** With a Google account, up to 3 lectures a day, each up to 2 hours.

---

## 9. Comparison

**Title:** Not another note taker.

**Caption (table caption, visible):** How Lectheo compares with common kinds of study tools. Based on public product information, October 2026.

Compares **categories**, not named products (decided 6 Oct): easier to keep true, no trademark issues. The named-product matrix stays in [[Lectheo Competition]].

| | **Lectheo** | AI note takers | AI notebooks | AI tutor chat modes |
|---|---|---|---|---|
| Starts from where *you* got lost | ✓ | — | — | — |
| Asks how sure you are before you answer | ✓ | — | — | — |
| Finds confident mistakes | ✓ | — | — | — |
| Practice that needs reasoning, not recall | ✓ | Mostly flashcards and quizzes | Some | ✓ |
| Questions checked by a second AI before you see them | ✓ | — | — | — |
| Feedback links to the lecture moment | ✓ | Some | ✓ | — |
| Mastery needs two kinds of evidence | ✓ | — | — | — |
| Notes, summaries, flashcards | — by design | ✓ | ✓ | Some |

Text alternatives: ✓ = "Yes", — = "No", other cells read as written.

---

## 10. FAQ

**What is Lectheo?**
An AI study partner for lectures. It finds what you personally don't understand, using your "I'm lost" marks and a confidence-rated diagnostic, then gives you practice that makes you reason with those ideas.

**Who is it for?**
Computer science students who learn from lectures, live or recorded. The sample uses CS50x, and the activities are written for CS concepts.

**Do I need an account to try it?**
No. **Try the sample account** gives you your own copy of a student partway through CS50x, with Lecture 5 ready to watch. It's deleted after 24 hours. To add your own lectures, continue with Google. Your account starts empty: just your courses, nothing preloaded.

**What happens to my lecture recordings?**
Video never leaves your laptop; only the transcript is uploaded. Audio you upload is deleted as soon as it's transcribed, and so is the transcription provider's copy. Speaker names are removed from transcripts. Deleting a lecture deletes everything made from it. You can delete your account at any time from the account menu. Details are in the [privacy policy](/privacy).

**Which AI does it use, and can it be wrong?**
Several models through one gateway: one writes questions, a model from a different company checks them, and a separate judge grades against a fixed rubric. It can still be wrong, which is why every result links to the lecture so you can check it.

**Will it just give me the answers?**
No. You get a guiding question and a second try first. You can ask for the explanation early, but then that attempt doesn't count towards Mastered.

**Why no flashcards or streaks?**
Plenty of apps help you remember. Lectheo checks whether you can use what you remember. Streaks reward opening the app, not understanding.

**Who made it?**
Lectheo is built by Adam Chok, a computer science master's student. It started at ForgeHacks 2026 and is open source on [GitHub](https://github.com/adamchok/Lectheo).

---

## 11. Final call to action

**Line (display-md):** See what you've been missing.

**Buttons:** Try the sample account (primary) · Continue with Google (outline)

**Caption:** Takes about two minutes. No sign-up.

---

## Footer

- Product: How it works · Practice · Why Lectheo · FAQ
- Legal: Privacy · Terms
- GitHub (https://github.com/adamchok/Lectheo; the repo must be public by launch)
- Credit (caption): Sample lectures from CS50x 2026 by Harvard University (Fall 2025 recordings), CC BY-NC-SA 4.0. Not affiliated with or endorsed by CS50.
- Name note (caption): Lectheo: *lectio*, a reading, + *theōria*, seeing.
- © 2026 Adam Chok
