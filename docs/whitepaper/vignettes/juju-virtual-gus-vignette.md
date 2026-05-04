# Vignette: <a short title that captures the moment>

**Student:** JuJu
**Project:** Virtual Gus
**Camera used:** VIAM Rover
**When it happened:** Sat May 2, ~8:00pm 
**Who was in the room:** Seren, Kathy, JuJu

---

## The moment

One paragraph — roughly 5–10 sentences. Tell it like you're telling a friend the story over dinner.

Set the scene first: who was where, what they were doing, what the room felt like. Then the moment itself — what did the camera or your project do, and how did people actually react? Did anyone laugh, ignore it, get confused, get it instantly? Did the timing land or feel off?

Try to stay in **present tense**. *"Phil flips the arUco tag and the timer starts"* feels alive in a way *"Phil flipped the tag and the timer started"* doesn't. No code, no implementation details — this is a scene, not a bug report.

> *Energy effect:* It's Monday afternoon, and there students listening to a lecture. Everyone looks tired and needs a break. When they decide to take a break, 'Gus mode' gets activated. Virtual Gus (a real-time video of Gus at Kathy's apartment) is projected on the wall. Everyone instantly feels much more energized.  

> *Virtual Gus GUI:* Gus walks out of the frame, so 'Gus mode' is no longer alive. Seren turns on the VIAM remote control website and controls the angle of the camera so that it starts facing Gus again. Students are pleased to see Gus again.

> *Ending Gus Mode:* 'Lecture' starts again and students are still paying too much attention on Gus. Kathy manually turns off Gus mode to focus in class. Gus disappears to the void. 

## Why this moment mattered

Two or three sentences. What did this moment reveal that a screenshot can't? Was it about timing, body language, surprise, an edge case, a misunderstanding? **"The system worked" is not enough** — what specifically did this expose about how the room and the software relate to each other?

This is the section that turns a story into a finding. Don't skip it.

> Gus was not allowed to come to school, and everyone (including Kathy) missed having Gus in the classroom with us. Instead of having Gus inside the screen, we projected Gus on the wall so that it feels like we have him here. 

## One supporting artifact (optional)

If you have a screenshot, photo, short clip, or Discord log excerpt that captures part of the moment, drop it in `docs/whitepaper/artifacts/` using the convention `<firstname>-<project>-vignette.<ext>` and link it here:

![](../artifacts/<firstname>-<project>-vignette.png)

Caption: one sentence describing what we're looking at.

If the moment was too quick or too subtle to capture cleanly, say so — *"no artifact, this happened in 4 seconds and I didn't have a camera up"* is a fine answer.

*no artifact at the moment, will update on Monday due to technical reasons*

---

*Submission checklist:*
- [ ] File named `<firstname>-<project>-vignette.md` and placed in `docs/whitepaper/vignettes/`
- [ ] Names a real moment, not a hypothetical or composite of several moments
- [ ] Sets the scene (time, place, who was there) before the moment itself
- [ ] "Why this mattered" goes beyond "it worked"
- [ ] No code snippets — this is a story, not a tutorial
- [ ] Your words, not AI-generated
- [ ] Opened as a pull request, not pushed to `main`
