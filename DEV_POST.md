---
title: "LevelOut: an anime-style System that levels you up at a real skill, outside"
tags: hacktoberfestchallenge, opensource, ai, devchallenge
---

*This is a submission for the Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass.*

## What I Built

**LevelOut** turns learning a real skill into a leveling anime.

You know the trope: a weak hero gets chosen by a mysterious **System** that hands out daily quests, and every completed quest makes them stronger. I wanted that feeling for real life, with the quests happening **outside**.

1. **Pick a skill.** Football, cricket bowling, badminton footwork, skipping, a 5K, or type anything.
2. **Tell the System what you have**: a wall, stairs, water bottles, a ball, or nothing at all.
3. **Take the trial.** The open-weight model writes 6 questions for *your* skill, including an injury check.
4. **Awaken.** You get a rank (E to S), a title like *E-Rank Striker*, five stats (STR / AGI / VIT / SKL / FOC), a 30-day goal, a rank-up test and a weekly plan.
5. **Daily Quest.** Warm-up, drills, cool-down, bonus. Every drill works **alone, outdoors, with only the things you said you have**.
6. **Pocket your phone.** Accepting the quest starts a timer and tells you to go.
7. **Report back.** Rate each drill *Easy / Just right / Hard / Hurt / Skipped*. You earn XP, stats and levels, and **the next quest adapts**. Drills that hurt are replaced with gentler ones for a different body part.

To rank up you have to pass a **real-world test** the System set for you, such as "juggle 25 times in a row". The game only moves when you do.

## Demo

<!-- Add your deployed link and/or a short screen recording here -->
🔗 Live demo: `<your link>`
💻 Code: `<your GitHub link>/tree/main/levelout`

![Daily quest](<link to docs/quest.png>)

## How open-source AI powers it

**LevelOut runs an open-weight model, and it can run that model locally too.**

- **Open-weight model:** the System is **Qwen2.5-72B-Instruct**, called through **Hugging Face Inference Providers** with the open-source `huggingface_hub` client. You can swap in Llama, Gemma or Mistral by changing one environment variable.
- **Local inference (optional):** set `LLM_BASE_URL` to an **Ollama**, **llama.cpp** or **vLLM** server and the same app runs entirely on weights you host yourself, with no code changes.

The open model isn't decoration. **It is the game master.** Without it there is no trial, no rank, no quest and no adaptation. It does three jobs, each with a strict JSON contract:

| Step | What the open model does |
|---|---|
| Trial | Writes level-check questions specific to the chosen skill |
| Awakening | Rates the Player honestly (most people start at E or D), sets stats, a 30-day goal, a rank-up test and a 7-day plan |
| Daily Quest | Designs drills from the Player's own equipment, then **adapts** them using the last report. Drills that hurt are replaced. |

The game maths (XP curve, levels, rank gates, streaks, penalty quests) is deterministic JavaScript in the browser, so the model can't "inflate" your progress. You only level up by doing the drills.

## Touching grass

The whole design pushes you off the screen:
- the quest is short enough to remember, then the screen says *"Put your phone in your pocket"*;
- nothing needs a gym, a partner or a subscription, just a park and a wall;
- the bonus quests are things like *"Walk home the long way and notice three things you've never seen before."*

## What I learned

- Asking an open model for a **fixed JSON shape** per step made the output reliable enough to drive a game UI. A single retry on bad JSON covers the rest.
- Safety had to be designed in, not bolted on: an injury question in every trial, a safety line in every quest, and a hard rule that a "Hurt" rating replaces the drill.

## What's next

- An open-weight vision model that checks a photo of your stance and gives a form tip
- Weekly "dungeon" challenges you can do with friends in the same park
- Offline-first PWA so the quest works with no signal

*Built with Flask, vanilla JS, and an open-weight model on Hugging Face. MIT licensed.*
