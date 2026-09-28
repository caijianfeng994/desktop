"""抽屉取物开放挑战：判定与幂等结算。"""

import json

from desktop_robot.game.engine import GameError, GameStore
from desktop_robot.game.missions_open import CHALLENGE, DRAWER_BLOCK_ID, evaluate_drawer_result


def action(store, kind, **kwargs):
    return store.act(dict(action=kind, revision=store.get()["revision"], **kwargs))


def _add_gripper_to_active_blueprint(store):
    """阶段5 装配契约：drawer-block 要求蓝图含 gripper。测试用默认蓝图不含，这里注入一个实例。"""
    import json

    with store.connect() as db:
        raw = json.loads(db.execute("SELECT state FROM game WHERE id=1").fetchone()[0])
        bp_id = raw.get("active_blueprint_id")
        for bp in raw.get("blueprints", []):
            if bp.get("id") == bp_id:
                bp.setdefault("instances", []).append(
                    {
                        "instance_id": "gripper-test-1",
                        "part_id": "gripper",
                        "local_pose": {"x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0},
                    }
                )
        db.execute(
            "UPDATE game SET state=? WHERE id=1", (json.dumps(raw, ensure_ascii=False),)
        )


def test_evaluate_drawer_ok_and_fail_cases():
    ok = evaluate_drawer_result(
        {"block_id": DRAWER_BLOCK_ID, "region": "receive", "speed": 0.02}
    )
    assert ok["ok"] is True

    wrong_block = evaluate_drawer_result(
        {"block_id": "practice-block", "region": "receive", "speed": 0.0}
    )
    assert wrong_block["ok"] is False

    wrong_region = evaluate_drawer_result(
        {"block_id": DRAWER_BLOCK_ID, "region": "drawer", "speed": 0.0}
    )
    assert wrong_region["ok"] is False

    too_fast = evaluate_drawer_result(
        {"block_id": DRAWER_BLOCK_ID, "region": "receive", "speed": 0.2}
    )
    assert too_fast["ok"] is False

    boundary = evaluate_drawer_result(
        {"block_id": DRAWER_BLOCK_ID, "region": "receive", "speed": 0.05}
    )
    assert boundary["ok"] is True


def test_start_and_submit_awards_once(tmp_path):
    store = GameStore(tmp_path)
    snap = store.get()
    assert any(c["id"] == "drawer-block" for c in snap["open_challenges"])
    assert snap.get("completed_challenges") == []

    # 故意不装 camera / arm，验证结算不依赖 equipped
    assert "camera" not in snap["equipped"]
    assert "arm" not in snap["equipped"] and "arm_left" not in snap["equipped"]

    coins0 = snap["coins"]
    xp0 = snap["xp"]

    _add_gripper_to_active_blueprint(store)
    state, _ = action(store, "start_challenge", mission="drawer-block")
    ch = state["challenge"]
    assert ch["id"] == CHALLENGE["id"]
    assert isinstance(ch["run_id"], str) and len(ch["run_id"]) == 32
    assert ch["blueprint_id"]
    assert ch.get("blueprint_version") is not None or ch.get("revision") is not None
    assert ch["started"] is True

    state, msg = action(
        store,
        "submit_challenge",
        run_id=ch["run_id"],
        block_id=DRAWER_BLOCK_ID,
        region="receive",
        speed=0.01,
    )
    assert CHALLENGE["id"] in state["completed_challenges"]
    assert state["coins"] == coins0 + CHALLENGE["reward"]
    assert state["xp"] == xp0 + CHALLENGE["xp"]
    assert "零件币" in msg or "完成" in msg

    coins1 = state["coins"]
    xp1 = state["xp"]
    # 同一 run 再提交：成功但不重复发奖
    state, msg2 = action(
        store,
        "submit_challenge",
        run_id=ch["run_id"],
        block_id=DRAWER_BLOCK_ID,
        region="receive",
        speed=0.0,
    )
    assert state["coins"] == coins1
    assert state["xp"] == xp1
    assert state["completed_challenges"].count(CHALLENGE["id"]) == 1
    assert "首次" in msg2 or "再次" in msg2


def test_submit_does_not_require_camera_or_arm(tmp_path):
    store = GameStore(tmp_path)
    # 卸掉可能默认带的 display，保持无 camera/arm
    state = store.get()
    for part in list(state["equipped"]):
        if part in ("camera", "arm", "arm_left"):
            action(store, "equip", part=part)

    state, _ = action(store, "start_challenge", mission="drawer-block")
    run_id = state["challenge"]["run_id"]
    assert "camera" not in state["equipped"]
    assert not {"arm", "arm_left"}.intersection(state["equipped"])
    _add_gripper_to_active_blueprint(store)

    state, _ = action(
        store,
        "submit_challenge",
        run_id=run_id,
        block_id=DRAWER_BLOCK_ID,
        region="receive",
        speed=0.0,
    )
    assert CHALLENGE["id"] in state["completed_challenges"]


def test_submit_rejects_mismatched_run_id(tmp_path):
    store = GameStore(tmp_path)
    action(store, "start_challenge", mission="drawer-block")
    try:
        action(
            store,
            "submit_challenge",
            run_id="deadbeef" * 4,
            block_id=DRAWER_BLOCK_ID,
            region="receive",
            speed=0.0,
        )
        raise AssertionError("expected GameError")
    except GameError as exc:
        assert "过期" in str(exc) or "回合" in str(exc)


def test_submit_rejects_mismatched_blueprint_id(tmp_path):
    store = GameStore(tmp_path)
    _add_gripper_to_active_blueprint(store)
    state, _ = action(store, "start_challenge", mission="drawer-block")
    run_id = state["challenge"]["run_id"]
    with store.connect() as db:
        raw = json.loads(db.execute("SELECT state FROM game WHERE id=1").fetchone()[0])
        raw["active_blueprint_id"] = "not-the-challenge-blueprint"
        db.execute("UPDATE game SET state=? WHERE id=1", (json.dumps(raw, ensure_ascii=False),))
    try:
        action(
            store,
            "submit_challenge",
            run_id=run_id,
            block_id=DRAWER_BLOCK_ID,
            region="receive",
            speed=0.0,
        )
        raise AssertionError("expected GameError")
    except GameError as exc:
        assert "蓝图" in str(exc)
