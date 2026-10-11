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

🔗 **Try it live:** PASTE_RENDER_LINK_HERE

{% embed PASTE_YOUTUBE_LINK_HERE %}
💻 Code: https://github.com/SRG-Cy/LevelOut

![Daily quest](https://raw.githubusercontent.com/SRG-Cy/LevelOut/main/docs/levelup.png)

## How open-source AI powers it

**LevelOut runs an open-weight model, and it can run that model locally too.**

- **Open-weight model:** the System runs on **gpt-oss-120b**, an open-weight model (Apache 2.0), served by **Groq** through its OpenAI-compatible API and called with the open-source `huggingface_hub` client. Any open model works: Qwen through Hugging Face Inference Providers is built in, and Llama, Gemma or Mistral are one environment variable away.
- **Local inference (optional):** set `LLM_BASE_URL` to an **Ollama**, **llama.cpp** or **vLLM** server and the same app runs entirely on weights you host yourself, with no code changes.

The open model isn't decoration. **It is the game master.** Without it there is no trial, no rank, no quest and no adaptation. It does three jobs, each with a strict JSON contract:

| Step | What the open model does |
|---|---|
| Trial | Writes level-check questions specific to the chosen skill |
| Awakening | Rates the Player honestly (most people start at E or D), sets stats, a 30-day goal, a rank-up test and a 7-day plan |
| Daily Quest | Designs drills from the Player's own equipment, then **adapts** them using the last report. Drills that hurt are replaced. |

The game maths (XP curve, levels, rank gates, streaks, penalty quests) is deterministic JavaScript in the browser, so the model can't "inflate" your progress. You only level up by doing the drills.

## You can't fake it

A game about going outside is pointless if you can tap "done" from your sofa, so the System enforces fair play:
reporting is **time-locked** to the session, **only drills you ticked live earn XP** (each tick at least a minute apart),
an empty report is a red **QUEST FAILED**, and on phones the **motion sensor** awards "Movement verified: +10% XP" when you actually move.

## Touching grass

The whole design pushes you off the screen:
- the quest is short enough to remember, then the screen says *"Put your phone in your pocket"*;
- nothing needs a gym, a partner or a subscription, just a park and a wall;
- the bonus quests are things like *"Walk home the long way and notice three things you've never seen before."*

## Why open matters here

- **Your training data stays yours.** Fitness and injury answers are personal. Because the System is an open-weight model, you can run the exact same app on your own machine or server with `LLM_BASE_URL`, and nothing leaves it.
- **No lock-in.** The model is a setting, not a dependency: gpt-oss today, Qwen, Llama or Gemma tomorrow, on any host or none.
- **Anyone can audit the coach.** The prompts (`prompts.py`) and the model weights are both public, so you can see exactly why the System gave you a drill, and change it if it's wrong for you.
- **Free to run.** Open models on free hosts, or on your own hardware, mean a student can use a personal coach without a subscription.

## What I learned

- Asking an open model for a **fixed JSON shape** per step made the output reliable enough to drive a game UI. A single retry on bad JSON covers the rest.
- Safety had to be designed in, not bolted on: an injury question in every trial, a safety line in every quest, and a hard rule that a "Hurt" rating replaces the drill.

## Prize Categories

**Render.** LevelOut is deployed on Render's free tier from a `render.yaml` Blueprint in the repo, so anyone can fork it and get their own System running in a few clicks: Render reads the build and start commands, pins Python, sets the open-model settings, and only asks you to paste your own API key, which never touches the repo. Two choices were shaped by running it as a public Render service: a 120-second gunicorn timeout, because reasoning models like gpt-oss can think for a while before answering, and a per-visitor limit on AI calls so a public link can't drain the key's free quota.

## What's next

- An open-weight vision model that checks a photo of your stance and gives a form tip
- Weekly "dungeon" challenges you can do with friends in the same park
- Offline-first PWA so the quest works with no signal

*Built with Flask, vanilla JS, and the open-weight gpt-oss-120b model served by Groq. MIT licensed.*
