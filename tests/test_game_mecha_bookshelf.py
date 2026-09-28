"""书架救援挑战与掉落。"""

from desktop_robot.game.engine import GameStore, _grant_loot
from desktop_robot.game.missions_open import BOOKSHELF_CHALLENGE, CHALLENGES_BY_ID, evaluate_drawer_result
from desktop_robot.game.templates import engineer_mecha_blueprint


def test_bookshelf_challenge_registered():
    assert "bookshelf-rescue" in CHALLENGES_BY_ID
    c = CHALLENGES_BY_ID["bookshelf-rescue"]
    assert c["block_id"] == "bookshelf-rescue-cube"
    assert c.get("loot")


def test_bookshelf_evaluate_success():
    r = evaluate_drawer_result(
        {
            "challenge_id": "bookshelf-rescue",
            "block_id": "bookshelf-rescue-cube",
            "region": "receive",
            "speed": 0.01,
        }
    )
    assert r["ok"] is True


def test_grant_loot_unlocks_thruster_and_winch_schematic():
    state = {"inventory": {"parts": {}, "schematics": []}, "owned_freeform": ["core"]}
    notes = _grant_loot(state, BOOKSHELF_CHALLENGE["loot"])
    assert notes
    assert "thruster_pack" in state["owned_freeform"]
    assert "winch_module" in state["owned_freeform"]
    assert state["inventory"]["parts"].get("thruster_pack", 0) >= 1


def test_start_bookshelf_challenge_with_engineer_mecha(tmp_path):
    store = GameStore(tmp_path)
    state = store.get()
    bp = engineer_mecha_blueprint()
    state, _ = store.act(
        {
            "action": "blueprint_replace",
            "revision": state["revision"],
            "blueprint": bp.model_dump(mode="json"),
        }
    )
    state, msg = store.act(
        {
            "action": "start_challenge",
            "revision": state["revision"],
            "mission": "bookshelf-rescue",
        }
    )
    assert "书架" in msg
    assert state["challenge"]["id"] == "bookshelf-rescue"
