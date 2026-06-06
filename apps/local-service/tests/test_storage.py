import json
import sqlite3
from pathlib import Path

from job_apply_assistant.models import MatchResult
from job_apply_assistant.storage import Storage


def make_match_result(*, score: int = 86, should_queue: bool = True) -> MatchResult:
    return MatchResult(
        passedHardFilters=True,
        hardFilterReasons=[],
        score=score,
        reasons=["项目经历匹配"],
        risks=[],
        greeting="您好，我有机器人项目经验，期待沟通。",
        shouldQueue=should_queue,
    )


def test_storage_saves_and_loads_match_result_roundtrip(tmp_path: Path) -> None:
    storage = Storage(tmp_path / "app.db")
    storage.initialize()
    result = make_match_result(score=91)

    storage.save_match_result("https://www.zhipin.com/job_detail/1.html", result)

    loaded = storage.get_match_result("https://www.zhipin.com/job_detail/1.html")
    assert loaded == result


def test_storage_upsert_replaces_existing_match_result_payload(tmp_path: Path) -> None:
    storage = Storage(tmp_path / "app.db")
    storage.initialize()
    job_url = "https://www.zhipin.com/job_detail/2.html"

    storage.save_match_result(job_url, make_match_result(score=70, should_queue=True))
    storage.save_match_result(job_url, make_match_result(score=95, should_queue=False))

    loaded = storage.get_match_result(job_url)
    assert loaded is not None
    assert loaded.score == 95
    assert loaded.should_queue is False


def test_storage_returns_none_for_missing_job_url(tmp_path: Path) -> None:
    storage = Storage(tmp_path / "app.db")
    storage.initialize()

    assert storage.get_match_result("https://www.zhipin.com/job_detail/missing.html") is None


def test_storage_persists_match_result_as_camel_case_wire_json(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    storage = Storage(db_path)
    storage.initialize()
    job_url = "https://www.zhipin.com/job_detail/3.html"

    storage.save_match_result(job_url, make_match_result())

    with sqlite3.connect(db_path) as connection:
        row = connection.execute("SELECT payload FROM match_results WHERE job_url = ?", (job_url,)).fetchone()

    assert row is not None
    payload_text = row[0]
    payload = json.loads(payload_text)
    assert "passedHardFilters" in payload
    assert "passed_hard_filters" not in payload
    assert "shouldQueue" in payload
    assert "should_queue" not in payload
    assert "项目经历匹配" in payload_text
