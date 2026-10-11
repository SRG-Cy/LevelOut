import json
from types import SimpleNamespace

import pytest

import app as lo


class FakeClient:
    def __init__(self, *contents):
        self.contents = list(contents)
        self.calls = []

    def chat_completion(self, messages, **kwargs):
        self.calls.append(messages)
        item = self.contents.pop(0)
        if isinstance(item, Exception):
            raise item
        msg = SimpleNamespace(content=item)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


@pytest.fixture
def client():
    return lo.app.test_client()


PROFILE = {"rank": "E", "stats": {"STR": 7, "SKL": 4}, "weaknesses": ["stamina"], "goal": "Juggle 25"}


def test_demo_flow_covers_every_endpoint(client, monkeypatch):
    monkeypatch.setattr(lo, "client", None)
    assess = client.post("/api/assess", json={"skill": "football"}).get_json()
    assert len(assess["result"]["questions"]) == 6
    awaken = client.post("/api/awaken", json={"skill": "football", "answers": [{"q": "a", "a": "b"}]}).get_json()
    assert awaken["result"]["rank"] == "E" and len(awaken["result"]["weekly_plan"]) == 7
    quest = client.post("/api/quest", json={"skill": "football", "profile": PROFILE}).get_json()
    assert quest["demo"] and quest["result"]["drills"]


def test_demo_quest_adapts_to_pain(client, monkeypatch):
    monkeypatch.setattr(lo, "client", None)
    body = {"skill": "football", "profile": PROFILE, "ratings": [{"name": "Hill sprints", "rating": "pain"}]}
    names = [d["name"] for d in client.post("/api/quest", json=body).get_json()["result"]["drills"]]
    assert "Brisk walk intervals" in names and "Hill or stair sprints" not in names


def test_validation(client):
    assert client.post("/api/assess", json={}).status_code == 400
    assert client.post("/api/awaken", json={"skill": "x", "answers": []}).status_code == 400
    assert client.post("/api/quest", json={"skill": "x", "profile": "nope"}).status_code == 400


def test_quest_prompt_carries_debrief_and_equipment(client, monkeypatch):
    fake = FakeClient("oops", json.dumps({"name": "Q", "drills": []}))
    monkeypatch.setattr(lo, "client", fake)
    body = {
        "skill": "cricket bowling", "profile": PROFILE, "equipment": ["A wall", "Water bottles"],
        "ratings": [{"name": "Run-up", "rating": "pain"}, {"name": "Bad", "rating": "<script>"}],
        "note": "left knee sore", "minutes": 500,
    }
    data = client.post("/api/quest", json=body).get_json()
    assert data == {"demo": False, "result": {"name": "Q", "drills": []}}
    prompt = fake.calls[0][1]["content"]
    assert "Run-up: pain" in prompt and "<script>" not in prompt
    assert "left knee sore" in prompt and "A wall, Water bottles" in prompt
    assert "90 minutes" in prompt  # clamped
    assert len(fake.calls) == 2  # retried after bad JSON


def test_model_error_is_502(client, monkeypatch):
    monkeypatch.setattr(lo, "client", FakeClient(RuntimeError("rate limited")))
    res = client.post("/api/assess", json={"skill": "running"})
    assert res.status_code == 502 and "rate limited" in res.get_json()["error"]


def test_llm_base_url_switches_to_self_hosted_server(monkeypatch):
    import importlib

    monkeypatch.delenv("HF_TOKEN", raising=False)
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1")
    try:
        mod = importlib.reload(lo)
        assert mod.client is not None and mod.LLM_BASE_URL == "http://localhost:11434/v1"
        assert b"via localhost" in mod.app.test_client().get("/").data
    finally:
        monkeypatch.delenv("LLM_BASE_URL")
        importlib.reload(lo)


def test_fast_demo_flag_is_server_side(monkeypatch):
    import importlib

    monkeypatch.setenv("FAST_DEMO", "1")
    try:
        page = importlib.reload(lo).app.test_client().get("/").data
        assert b'data-fast="1"' in page and b"FAST DEMO MODE" in page
    finally:
        monkeypatch.delenv("FAST_DEMO")
        page = importlib.reload(lo).app.test_client().get("/").data
        assert b"data-fast" not in page


def test_ai_requests_are_rate_limited_per_visitor(client, monkeypatch):
    monkeypatch.setattr(lo, "AI_REQUESTS_PER_HOUR", 2)
    monkeypatch.setattr(lo, "_recent_calls", lo.defaultdict(lo.deque))
    monkeypatch.setattr(lo, "client", FakeClient('{"questions": []}', '{"questions": []}', '{"questions": []}'))
    headers = {"X-Forwarded-For": "203.0.113.7"}
    codes = [client.post("/api/assess", json={"skill": "running"}, headers=headers).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    other = client.post("/api/assess", json={"skill": "running"}, headers={"X-Forwarded-For": "198.51.100.2"})
    assert other.status_code == 200
