from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from job_apply_assistant.models import MatchResult


class Storage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS match_results (
                    job_url TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def save_match_result(self, job_url: str, result: MatchResult) -> None:
        payload = json.dumps(result.to_wire(), ensure_ascii=False)
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO match_results (job_url, payload)
                VALUES (?, ?)
                ON CONFLICT(job_url) DO UPDATE SET payload = excluded.payload
                """,
                (job_url, payload),
            )

    def get_match_result(self, job_url: str) -> MatchResult | None:
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT payload FROM match_results WHERE job_url = ?",
                (job_url,),
            ).fetchone()

        if row is None:
            return None
        return MatchResult.model_validate(json.loads(row[0]))
