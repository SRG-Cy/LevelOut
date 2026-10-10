"""Sample System replies used when no HF_TOKEN is set, so the app can be tried offline."""


def _skill(skill):
    return (str(skill).strip() or "football")[:60]


def assess(skill):
    s = _skill(skill)
    return {
        "system_message": f"[Trial] A Player seeks mastery of {s}. Answer truthfully. The System is watching.",
        "questions": [
            {"q": f"How would you describe your {s} right now?", "options": ["Never tried it", "Tried it a few times", "I can do the basics", "I play regularly"]},
            {"q": "How often have you practised in the last month?", "options": ["Not at all", "Once or twice", "Every week", "Most days"]},
            {"q": "How long can you jog without stopping?", "options": ["Under 2 minutes", "About 5 minutes", "About 15 minutes", "30 minutes or more"]},
            {"q": "How many push-ups can you do in a row?", "options": ["0–2", "3–10", "11–25", "More than 25"]},
            {"q": "What do you want most?", "options": ["Learn the basics", "Get fitter while learning", "Play with friends without embarrassment", "Compete"]},
            {"q": "Any injuries or pain right now?", "options": ["No", "Old injury, fine now", "Some knee, ankle or back pain", "Yes, a current injury"]},
        ],
    }


def awaken(skill):
    s = _skill(skill)
    return {
        "rank": "E",
        "title": f"E-Rank {s.title()} Initiate",
        "system_message": "[Awakening complete] You are weak. That is the starting line, not the end.",
        "summary": f"You know a little about {s} but have not trained it regularly. Your stamina is your biggest limit right now.",
        "stats": {"STR": 7, "AGI": 8, "VIT": 6, "SKL": 4, "FOC": 7},
        "strengths": ["Willing to start", "Decent balance"],
        "weaknesses": ["Stamina", f"Basic {s} technique", "Consistency"],
        "goal": "Train 12 times in 30 days and pass your rank-up test",
        "rank_up_test": "Complete three daily quests in a row with every drill rated 'ok' or 'easy'",
        "weekly_plan": [
            {"day": "Day 1", "focus": "Basic technique"},
            {"day": "Day 2", "focus": "Stamina"},
            {"day": "Day 3", "focus": "Rest and stretch"},
            {"day": "Day 4", "focus": "Footwork and agility"},
            {"day": "Day 5", "focus": "Technique under fatigue"},
            {"day": "Day 6", "focus": "Rest and stretch"},
            {"day": "Day 7", "focus": "Rank-up test practice"},
        ],
    }


def quest(skill, ratings):
    s = _skill(skill)
    adapted = any(isinstance(r, dict) and r.get("rating") == "pain" for r in ratings)
    sprint = (
        {"name": "Brisk walk intervals", "how": "Walk fast for 1 minute, then slowly for 1 minute. This replaces sprints while your pain settles.",
         "target": "6 rounds", "stat": "VIT", "xp": 20, "easier": "Walk at a steady pace", "harder": "Add a gentle slope"}
        if adapted else
        {"name": "Hill or stair sprints", "how": "Run up a short slope or flight of stairs at 80% effort, then walk back down to recover.",
         "target": "6 sprints", "stat": "AGI", "xp": 30, "easier": "Jog instead of sprint", "harder": "Do 10 sprints"}
    )
    return {
        "name": f"Daily Quest: {s.title()} Foundations",
        "system_message": "[Daily Quest has arrived] Complete it, or face the penalty.",
        "location": "A wall or open patch of ground in a park",
        "warmup": [
            {"name": "Light jog", "how": "Jog slowly in a big circle.", "target": "3 minutes"},
            {"name": "Leg swings", "how": "Hold a wall or tree and swing each leg forward and back.", "target": "10 per leg"},
        ],
        "drills": [
            {"name": "Wall passes", "how": f"Stand 3 steps from a wall and practise the core {s} movement against it, alternating sides.",
             "target": "3 sets of 20", "stat": "SKL", "xp": 30, "easier": "Stand closer", "harder": "Move back 2 steps"},
            {"name": "Bottle cone weave", "how": "Set 5 water bottles one step apart. Weave through them and back as fast as you can with control.",
             "target": "5 runs", "stat": "AGI", "xp": 25, "easier": "Walk the weave", "harder": "Time yourself and beat it"},
            sprint,
            {"name": "Squat and hold", "how": "Squat until thighs are level with the ground, hold 2 seconds, stand up.",
             "target": "3 sets of 12", "stat": "STR", "xp": 20, "easier": "Half squats", "harder": "Jump at the top"},
        ],
        "cooldown": [
            {"name": "Calf and hamstring stretch", "how": "Hold each stretch without bouncing.", "target": "30 seconds each"},
            {"name": "Slow breathing", "how": "Look at the sky. Breathe in for 4, out for 6.", "target": "1 minute"},
        ],
        "bonus": {"task": "Walk home the long way and notice three things you've never seen before", "xp": 15},
        "safety": "Stop any drill that causes sharp pain. Rest, and see a doctor if it continues."
        if adapted else "Drink water, and stop any drill that causes sharp pain.",
    }
