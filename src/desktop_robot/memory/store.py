from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class MemoryStore:
    def __init__(self, db_path: str) -> None:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS facts (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              source TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS skill_weights (
              intent TEXT NOT NULL,
              path_key TEXT NOT NULL,
              weight INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (intent, path_key)
            );
            CREATE TABLE IF NOT EXISTS skill_traces (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              intent TEXT NOT NULL,
              steps_json TEXT NOT NULL,
              ok INTEGER NOT NULL,
              reason TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )
        self._conn.commit()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def set_fact(self, key: str, value: str, source: str) -> None:
        self._conn.execute(
            """
            INSERT INTO facts(key, value, source, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value=excluded.value,
              source=excluded.source,
              updated_at=excluded.updated_at
            """,
            (key, value, source, self._now()),
        )
        self._conn.commit()

    def get_fact(self, key: str) -> str | None:
        row = self._conn.execute(
            "SELECT value FROM facts WHERE key = ?", (key,)
        ).fetchone()
        return None if row is None else row["value"]

    def delete_fact(self, key: str) -> bool:
        cur = self._conn.execute("DELETE FROM facts WHERE key = ?", (key,))
        self._conn.commit()
        return cur.rowcount > 0

    def list_facts(self, prefix: str = "") -> dict[str, str]:
        if prefix:
            rows = self._conn.execute(
                "SELECT key, value FROM facts WHERE key LIKE ?",
                (f"{prefix}%",),
            ).fetchall()
        else:
            rows = self._conn.execute("SELECT key, value FROM facts").fetchall()
        return {r["key"]: r["value"] for r in rows}

    def add_trace(
        self,
        intent: str,
        steps_json: str,
        ok: bool,
        reason: str,
        session_id: str,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO skill_traces(session_id, intent, steps_json, ok, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, intent, steps_json, 1 if ok else 0, reason, self._now()),
        )
        self._conn.commit()
        return int(cur.lastrowid)

    def get_weight(self, intent: str, path_key: str) -> int:
        row = self._conn.execute(
            "SELECT weight FROM skill_weights WHERE intent = ? AND path_key = ?",
            (intent, path_key),
        ).fetchone()
        return 0 if row is None else int(row["weight"])

    def set_weight(self, intent: str, path_key: str, weight: int) -> None:
        self._conn.execute(
            """
            INSERT INTO skill_weights(intent, path_key, weight)
            VALUES (?, ?, ?)
            ON CONFLICT(intent, path_key) DO UPDATE SET weight=excluded.weight
            """,
            (intent, path_key, weight),
        )
        self._conn.commit()

    def clear_all(self) -> None:
        self._conn.execute("DELETE FROM facts")
        self._conn.execute("DELETE FROM skill_weights")
        self._conn.execute("DELETE FROM skill_traces")
        self._conn.commit()
