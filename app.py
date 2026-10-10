"""LevelOut: an anime-style "System" that levels you up at a real skill, outside.

The System is an open-weight model. By default it is reached through Hugging Face
Inference Providers, so no AI runs on your own machine. Set LLM_BASE_URL to use any
other OpenAI-compatible server instead: a free open-model host such as Groq, or your
own Ollama, llama.cpp or vLLM. With neither
an HF_TOKEN nor LLM_BASE_URL the app runs in demo mode.
Progress (XP, levels, stats, streaks) is computed and stored in the browser.
"""

import json
import os
import re
from urllib.parse import urlparse

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from huggingface_hub import InferenceClient

import demo
import prompts

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
HF_MODEL = os.getenv("HF_MODEL", "Qwen/Qwen2.5-72B-Instruct")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").strip()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip() or HF_TOKEN
RATINGS = {"easy", "ok", "hard", "pain", "skipped"}

app = Flask(__name__)
if LLM_BASE_URL:  # e.g. https://api.groq.com/openai/v1, or http://localhost:11434/v1 for Ollama
    client = InferenceClient(base_url=LLM_BASE_URL, api_key=LLM_API_KEY or "local")
elif HF_TOKEN:
    client = InferenceClient(api_key=HF_TOKEN)
else:
    client = None


class ModelError(Exception):
    pass


class BadInput(Exception):
    pass


def parse_json(text):
    """Pull the first JSON object out of a model reply, tolerating code fences."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def ask_model(user_prompt, max_tokens=6000):  # room for reasoning models like gpt-oss
    """Call the open-weight model and return parsed JSON, retrying once on bad JSON."""
    messages = [
        {"role": "system", "content": prompts.BASE_RULES},
        {"role": "user", "content": user_prompt},
    ]
    last_error = None
    for _ in range(2):
        try:
            out = client.chat_completion(
                messages, model=HF_MODEL, max_tokens=max_tokens, temperature=0.6
            )
        except Exception as exc:  # network, auth, rate limit, model unavailable
            raise ModelError(f"The System could not be reached: {exc}") from exc
        content = out.choices[0].message.content or ""
        try:
            return parse_json(content)
        except json.JSONDecodeError as exc:
            last_error = exc
            messages += [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "That was not valid JSON. Reply with only the JSON object."},
            ]
    raise ModelError(f"The System returned an unreadable answer ({last_error}). Try again.")


# ---------- input helpers ----------

def text(data, key, limit, default=None):
    value = str(data.get(key) or "").strip()[:limit]
    if not value and default is None:
        raise BadInput(f"Missing {key}.")
    return value or default


def number(data, key, low, high, default):
    try:
        return max(low, min(high, int(data.get(key, default))))
    except (TypeError, ValueError):
        return default


def strings(data, key, limit=20, length=80):
    items = data.get(key) or []
    if not isinstance(items, list):
        return []
    return [str(i).strip()[:length] for i in items[:limit] if str(i).strip()]


def respond(build_prompt, demo_result):
    """Shared endpoint flow: validate input, then ask the model or return demo data."""
    data = request.get_json(silent=True) or {}
    try:
        user_prompt = build_prompt(data)
    except BadInput as exc:
        return jsonify(error=str(exc)), 400
    if client is None:
        return jsonify(result=demo_result(data), demo=True)
    try:
        return jsonify(result=ask_model(user_prompt), demo=False)
    except ModelError as exc:
        return jsonify(error=str(exc)), 502


# ---------- prompt builders ----------

def assess_prompt(data):
    return prompts.ASSESS.format(skill=text(data, "skill", 60))


def awaken_prompt(data):
    answers = data.get("answers") or []
    if not isinstance(answers, list) or not answers:
        raise BadInput("Answer the assessment questions first.")
    lines = "\n".join(
        f"- {str(a.get('q', ''))[:200]} -> {str(a.get('a', ''))[:200]}"
        for a in answers[:10]
        if isinstance(a, dict)
    )
    return prompts.AWAKEN.format(
        skill=text(data, "skill", 60),
        answers=lines,
        equipment=", ".join(strings(data, "equipment")) or "nothing but open ground",
        minutes=number(data, "minutes", 10, 90, 30),
        days=number(data, "days", 1, 7, 4),
    )


def quest_prompt(data):
    profile = data.get("profile") or {}
    if not isinstance(profile, dict):
        raise BadInput("Missing profile.")
    stats = profile.get("stats") if isinstance(profile.get("stats"), dict) else {}
    debrief = prompts.DEBRIEF_NONE
    ratings = data.get("ratings") or []
    if isinstance(ratings, list) and ratings:
        lines = "\n".join(
            f"- {str(r.get('name', ''))[:80]}: {r.get('rating')}"
            for r in ratings[:10]
            if isinstance(r, dict) and r.get("rating") in RATINGS
        )
        debrief = prompts.DEBRIEF.format(ratings=lines, note=text(data, "note", 300, "none"))
    return prompts.QUEST.format(
        skill=text(data, "skill", 60),
        rank=str(profile.get("rank", "E"))[:2],
        level=number(data, "level", 1, 999, 1),
        stats=", ".join(f"{k} {int(v)}" for k, v in stats.items() if isinstance(v, (int, float)))[:120],
        weaknesses=", ".join(strings(profile, "weaknesses", 5)) or "not known yet",
        goal=str(profile.get("goal", "improve steadily"))[:200],
        equipment=", ".join(strings(data, "equipment")) or "nothing but open ground",
        minutes=number(data, "minutes", 10, 90, 30),
        quest_number=number(data, "quest_number", 1, 9999, 1),
        focus=text(data, "focus", 120, "the main skill"),
        debrief=debrief,
    )


# ---------- routes ----------

@app.get("/")
def index():
    return render_template(
        "index.html", demo_mode=client is None, model=HF_MODEL,
        host=urlparse(LLM_BASE_URL).hostname if LLM_BASE_URL else "Hugging Face",
    )


@app.post("/api/assess")
def assess():
    return respond(assess_prompt, lambda d: demo.assess(d.get("skill", "")))


@app.post("/api/awaken")
def awaken():
    return respond(awaken_prompt, lambda d: demo.awaken(d.get("skill", "")))


@app.post("/api/quest")
def quest():
    return respond(quest_prompt, lambda d: demo.quest(d.get("skill", ""), d.get("ratings") or []))


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
