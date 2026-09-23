import json
import re
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from desktop_robot.game.engine import BLOCKED, LOW_OBSTACLES, GameError, GameStore
from desktop_robot.studio.http_server import make_server


def test_parts_snapshot_matches_definition_catalog(tmp_path):
    from desktop_robot.game.parts import PART_DEFINITIONS

    store = GameStore(tmp_path)
    ids = {p['id'] for p in store.get()['parts']}
    # 前端仍只需旧七件；完整目录可更大
    assert {"camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"} <= ids
    assert "core" in PART_DEFINITIONS
    assert "core" not in ids
    for part in store.get()['parts']:
        defn = PART_DEFINITIONS[part['id']]
        assert part['name'] == defn.name
        assert part['category'] == defn.category
        assert part['description'] == defn.description
        assert part['power'] == int(defn.power_w)
        assert part['ports'] == defn.ports
        assert part['price'] == defn.price
        assert part['ability'] == defn.ability
        assert part['icon'] == defn.icon
        assert part['owned'] == defn.owned_by_default


def action(store, kind, **kwargs):
    return store.act(dict(action=kind, revision=store.get()['revision'], **kwargs))[0]


def prepare(store):
    action(store, 'equip', part='display')
    action(store, 'equip', part='camera')
    return action(store, 'equip', part='arm')


def walk(store, target):
    state = store.get()
    start = tuple(state['active']['position'])
    blocked = {tuple(p) for p in BLOCKED + (LOW_OBSTACLES if 'tracks' not in state['equipped'] else [])}
    queue = deque([(start, [])])
    seen = {start}
    while queue:
        position, path = queue.popleft()
        if position == tuple(target):
            for point in path:
                action(store, 'move', position=list(point))
            return
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            point = position[0] + dx, position[1] + dy
            if all(0 <= v < 9 for v in point) and point not in seen and point not in blocked:
                seen.add(point)
                queue.append((point, path + [point]))
    raise AssertionError('No route to target')


def finish(store, mission):
    action(store, 'charge')
    action(store, 'start', mission=mission['id'])
    walk(store, mission['target'])
    action(store, 'scan')
    action(store, 'pick')
    walk(store, [1, 1])
    return action(store, 'deliver')


def test_full_campaign_persists_and_replays_do_not_mint_rewards(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    first = store.get()['missions'][0]
    result = finish(store, first)
    assert (result['coins'], result['xp'], len(result['memories'])) == (220, 30, 1)
    result = finish(store, first)
    assert (result['coins'], result['xp'], len(result['memories'])) == (220, 30, 1)
    finish(store, result['missions'][1])
    action(store, 'buy', part='battery')
    action(store, 'equip', part='battery')
    action(store, 'equip', part='display')
    result = finish(store, result['missions'][2])
    assert len(result['completed']) == 3
    assert result['xp'] == 120
    assert result['coins'] == 340
    assert result == GameStore(tmp_path).get()
    assert result['robot_id']


def test_power_limit_failed_action_is_atomic(tmp_path):
    store = GameStore(tmp_path)
    action(store, 'equip', part='camera')
    before = store.get()
    with pytest.raises(GameError, match='功耗'):
        action(store, 'equip', part='arm')
    assert store.get() == before
    action(store, 'buy', part='battery')
    action(store, 'equip', part='battery')
    action(store, 'equip', part='arm')
    with pytest.raises(GameError, match='功耗'):
        action(store, 'equip', part='battery')


def test_server_rejects_teleports_fake_completion_and_locked_missions(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    with pytest.raises(GameError, match='前一个'):
        action(store, 'start', mission='across-books')
    action(store, 'start', mission='first-light')
    for kind, args in [('move', {'position': [6, 2]}), ('move', {'position': [True, 2]}), ('scan', {}), ('pick', {}), ('deliver', {}), ('equip', {'part': 'camera'}), ('charge', {})]:
        before = store.get()
        with pytest.raises(GameError):
            action(store, kind, **args)
        assert store.get() == before
    action(store, 'move', position=[2, 1])
    action(store, 'move', position=[2, 2])
    with pytest.raises(GameError, match='障碍'):
        action(store, 'move', position=[3, 2])
    action(store, 'abandon')
    assert store.get()['active'] is None


def test_concurrent_revisions_prevent_double_purchase(tmp_path):
    store = GameStore(tmp_path)
    revision = store.get()['revision']
    def buy():
        try:
            store.act({'action': 'buy', 'part': 'battery', 'revision': revision})
            return True
        except GameError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: buy(), range(2)))
    assert sorted(results) == [False, True]
    assert store.get()['coins'] == 40
    assert store.get()['owned'].count('battery') == 1


def test_game_http_contract_and_static_boundary(tmp_path):
    server = make_server('127.0.0.1', 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    def get(path):
        with urlopen(base + path, timeout=5) as response:
            return response.read().decode()
    try:
        assert '小小工坊' in get('/')
        assert 'game.js' in get('/game')
        assert '选择创作路线' in get('/?track=studio')
        assert 'WorkshopScene' in get('/game-assets/scene.js')
        assert 'text/css' in urlopen(base + '/game-assets/game.css').headers['Content-Type']
        for path in ['/game-assets/../game.html', '/game-assets/../../http_server.py']:
            with pytest.raises(HTTPError) as error:
                get(path)
            assert error.value.code == 404
        state = json.loads(get('/api/game'))['state']
        req = Request(base + '/api/game/action', data=json.dumps({'action': 'equip', 'part': 'camera', 'revision': state['revision']}).encode(), headers={'Content-Type': 'application/json'}, method='POST')
        result = json.loads(urlopen(req).read())
        assert result['ok'] and 'camera' in result['state']['equipped']
        with pytest.raises(HTTPError) as error:
            urlopen(req)
        assert error.value.code == 400
    finally:
        server.shutdown()
        server.server_close()


def test_left_arm_can_complete_a_mission_without_right_arm(tmp_path):
    store = GameStore(tmp_path)
    action(store, 'equip', part='display')
    action(store, 'equip', part='camera')
    action(store, 'equip', part='arm_left')
    state = finish(store, store.get()['missions'][0])
    assert state['completed'] == ['first-light']
    assert 'arm' not in state['equipped']
    assert 'arm_left' in state['equipped']


def test_both_arms_have_independent_power_ports_and_removal(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    with pytest.raises(GameError, match='功耗'):
        action(store, 'equip', part='arm_left')
    action(store, 'buy', part='battery')
    action(store, 'equip', part='battery')
    both = action(store, 'equip', part='arm_left')
    assert (both['power'], both['ports']) == (17, 4)
    assert {'arm', 'arm_left'} <= set(both['equipped'])
    left_only = action(store, 'equip', part='arm')
    assert 'arm_left' in left_only['equipped']
    assert 'arm' not in left_only['equipped']
    assert left_only['power'] == 12
    no_arms = action(store, 'equip', part='arm_left')
    assert no_arms['power'] == 7
    with pytest.raises(GameError, match='机械臂'):
        action(store, 'start', mission='first-light')


def test_legacy_game_migration_preserves_progress_and_adds_left_arm_once(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    state = finish(store, store.get()['missions'][0])
    state = action(store, 'start', mission='across-books')
    # Reproduce the original on-disk v1 format, including a mission in progress.
    with store.connect() as db:
        raw = json.loads(db.execute('SELECT state FROM game WHERE id=1').fetchone()[0])
        raw['version'] = 1
        raw['owned'].remove('arm_left')
        raw['active'].pop('facing')
        raw.pop('blueprints', None)
        raw.pop('active_blueprint_id', None)
        db.execute('UPDATE game SET state=? WHERE id=1', (json.dumps(raw),))
    migrated = GameStore(tmp_path).get()
    assert migrated['version'] == 3
    assert migrated['owned'].count('arm_left') == 1
    assert migrated['active_blueprint_id']
    assert len(migrated['blueprints']) >= 1
    for key in ('coins', 'xp', 'memories', 'equipped', 'completed', 'robot_id'):
        assert migrated[key] == state[key]
    assert migrated['active']['position'] == state['active']['position']
    assert migrated['active']['facing'] == [0, 1]
    assert GameStore(tmp_path).get() == migrated


def test_v2_save_migrates_to_blueprint_without_losing_progress(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    state = finish(store, store.get()['missions'][0])
    with store.connect() as db:
        raw = json.loads(db.execute('SELECT state FROM game WHERE id=1').fetchone()[0])
        raw['version'] = 2
        raw.pop('blueprints', None)
        raw.pop('active_blueprint_id', None)
        db.execute('UPDATE game SET state=? WHERE id=1', (json.dumps(raw),))
    migrated = GameStore(tmp_path).get()
    assert migrated['version'] == 3
    assert migrated['active_blueprint_id']
    assert len(migrated['blueprints']) >= 1
    assert set(migrated['equipped']) == set(state['equipped'])
    assert migrated['coins'] == state['coins']
    assert migrated['completed'] == state['completed']
    again = GameStore(tmp_path).get()
    assert len(again['blueprints']) == len(migrated['blueprints'])


def test_movement_heading_persists_and_invalid_move_does_not_turn(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    action(store, 'start', mission='first-light')
    for position, facing in [([2, 1], [1, 0]), ([2, 2], [0, 1]), ([1, 2], [-1, 0]), ([1, 1], [0, -1])]:
        state = action(store, 'move', position=position)
        assert state['active']['facing'] == facing
        assert GameStore(tmp_path).get()['active']['facing'] == facing
    before = store.get()
    with pytest.raises(GameError):
        action(store, 'move', position=[7, 7])
    assert store.get() == before


def test_return_to_workshop_allows_refit_and_charge_without_losing_mission(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    action(store, 'start', mission='first-light')
    walk(store, [6, 2])
    action(store, 'scan')
    before = action(store, 'pick')
    paused = action(store, 'pause')
    assert paused['active']['paused'] is True
    for field in ('position', 'facing', 'scanned', 'carrying', 'moves'):
        assert paused['active'][field] == before['active'][field]
    action(store, 'equip', part='arm')
    action(store, 'charge')
    assert store.get()['energy'] == 100
    assert GameStore(tmp_path).get()['active']['paused'] is True
    with pytest.raises(GameError, match='机械臂'):
        action(store, 'resume')
    assert store.get()['active']['paused'] is True
    action(store, 'equip', part='arm_left')
    resumed = action(store, 'resume')
    assert resumed['active']['paused'] is False
    assert resumed['active']['carrying'] is True
    walk(store, [1, 1])
    result = action(store, 'deliver')
    assert result['coins'] == 220
    assert result['completed'] == ['first-light']


def test_paused_mission_cannot_move_or_settle_until_resumed(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    action(store, 'start', mission='first-light')
    action(store, 'pause')
    before = store.get()
    for kind, args in [('move', {'position': [2, 1]}), ('scan', {}), ('pick', {}), ('deliver', {})]:
        with pytest.raises(GameError, match='暂停'):
            action(store, kind, **args)
        assert store.get() == before
    action(store, 'equip', part='wheels')
    with pytest.raises(GameError, match='底盘'):
        action(store, 'resume')


def test_existing_active_save_can_pause_without_reset(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    action(store, 'start', mission='first-light')
    action(store, 'move', position=[2, 1])
    with store.connect() as db:
        raw = json.loads(db.execute('SELECT state FROM game WHERE id=1').fetchone()[0])
        raw['active'].pop('paused')
        db.execute('UPDATE game SET state=? WHERE id=1', (json.dumps(raw),))
    paused = action(GameStore(tmp_path), 'pause')
    assert paused['active']['position'] == [2, 1]
    assert paused['active']['moves'] == 1
    action(store, 'equip', part='arm')
    assert store.get()['active']['scanned'] is False


def test_equip_updates_active_blueprint_instances(tmp_path):
    store = GameStore(tmp_path)
    assert store.get()['version'] == 3
    before_ids = {i['part_id'] for b in store.get()['blueprints'] for i in b['instances']}
    action(store, 'equip', part='camera')
    state = store.get()
    part_ids = {i['part_id'] for b in state['blueprints'] if b['id'] == state['active_blueprint_id'] for i in b['instances']}
    assert 'camera' in part_ids
    assert 'camera' in state['equipped']
    action(store, 'equip', part='camera')  # toggle off
    state = store.get()
    part_ids = {i['part_id'] for b in state['blueprints'] if b['id'] == state['active_blueprint_id'] for i in b['instances']}
    assert 'camera' not in part_ids
    assert 'camera' not in state['equipped']


def test_play_quest_css_reserves_topbar_space():
    css = (Path('src/desktop_robot/studio/static/game/game.css')).read_text()
    assert '--topbar-height' in css
    assert 'play-quest' in css
    # 收起态类名约定
    assert 'play-quest-collapsed' in css or 'quest-collapsed' in css
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert 'id="toggle-quest"' in html or 'data-toggle-quest' in html


def test_narrow_play_quest_keeps_topbar_offset():
    css = Path('src/desktop_robot/studio/static/game/game.css').read_text()
    # 在 max-width:900px 块内，play 视图不得用 top:auto 取消顶栏避让
    narrow = css.split('@media(max-width:900px)')[1]
    assert 'body[data-view="play"] .play-quest' in narrow or 'data-view="play"] .play-quest' in narrow
    # 允许 sticky/absolute + top:calc(var(--topbar-height)；禁止仅 top:auto 且无替代避让
    play_rules = [s for s in narrow.split('}') if 'play-quest' in s and 'data-view="play"' in s]
    assert play_rules, 'missing play-quest override in narrow media'
    joined = '}'.join(play_rules)
    assert 'top:auto' not in joined or 'topbar-height' in joined
    assert 'topbar-height' in joined or 'padding-top' in joined
    assert 'position:sticky' in joined or 'position:absolute' in joined


def test_assembly_cta_says_go_to_missions():
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert '前往委托板' in html
    assert 'data-view="missions"' in html
    assert re.search(r'data-view="missions"[^>]*>\s*前往委托板', html)


def test_assembly_has_starter_loadout_button():
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert '应用推荐装配（首关）' in html
    assert 'id="apply-starter-loadout"' in html
    js = Path('src/desktop_robot/studio/static/game/game.js').read_text()
    assert "from './loadout.mjs'" in js
    assert 'planStarterLoadout' in js
    assert 'apply-starter-loadout' in js
    loadout = Path('src/desktop_robot/studio/static/game/loadout.mjs').read_text()
    assert 'export function planStarterLoadout' in loadout
    # 推荐装配路径不得自动 buy
    handler = js.split("$('#apply-starter-loadout')")[1].split("$('#scan')")[0]
    assert "act('buy'" not in handler
    assert "act('equip'" in handler


def test_blueprint_replace_accepts_quad_and_bumps_revision(tmp_path):
    from desktop_robot.game.templates import quad_chassis_arm_blueprint

    store = GameStore(tmp_path)
    before = store.get()
    rev = before['revision']
    bp = quad_chassis_arm_blueprint().model_dump(mode='json')
    # keep same id as active so replace is in-place by id
    bp['id'] = before['active_blueprint_id']
    state = action(store, 'blueprint_replace', blueprint=bp)
    assert state['revision'] == rev + 1
    active = next(b for b in state['blueprints'] if b['id'] == state['active_blueprint_id'])
    assert sum(1 for i in active['instances'] if i['part_id'] == 'wheel') == 4
    assert sum(1 for i in active['instances'] if i['part_id'] == 'revolute_joint') == 2
    assert any(i['part_id'] == 'gripper' for i in active['instances'])


def test_blueprint_replace_rejects_cycle_without_bumping_revision(tmp_path):
    store = GameStore(tmp_path)
    before = store.get()
    rev = before['revision']
    bad = {
        'id': before['active_blueprint_id'],
        'name': '坏环',
        'root_instance_id': 'core-1',
        'instances': [
            {'instance_id': 'core-1', 'part_id': 'core', 'local_pose': {'x': 0, 'y': 0, 'z': 0, 'rx': 0, 'ry': 0, 'rz': 0}, 'params': {}},
            {'instance_id': 'plate-1', 'part_id': 'plate', 'local_pose': {'x': 0, 'y': 0, 'z': 0, 'rx': 0, 'ry': 0, 'rz': 0}, 'params': {}},
        ],
        'connections': [
            {'parent_instance_id': 'core-1', 'parent_point_id': 'mount_bottom', 'child_instance_id': 'plate-1', 'child_point_id': 'face_a', 'joint': 'fixed'},
            {'parent_instance_id': 'plate-1', 'parent_point_id': 'face_b', 'child_instance_id': 'core-1', 'child_point_id': 'mount_top', 'joint': 'fixed'},
        ],
        'bindings': {},
    }
    with pytest.raises(GameError):
        store.act(dict(action='blueprint_replace', revision=rev, blueprint=bad))
    assert store.get()['revision'] == rev


def test_blueprint_rename_updates_active_name(tmp_path):
    store = GameStore(tmp_path)
    before = store.get()
    rev = before['revision']
    state = action(store, 'blueprint_rename', name='我的机架')
    assert state['revision'] == rev + 1
    active = next(b for b in state['blueprints'] if b['id'] == state['active_blueprint_id'])
    assert active['name'] == '我的机架'


def test_build_page_has_editor_hooks():
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert 'id="build"' in html
    assert 'id="build-world"' in html
    assert 'id="build-undo"' in html
    assert 'id="build-redo"' in html
    js = Path('src/desktop_robot/studio/static/game/game.js').read_text()
    assert 'editorScene' in js or 'templates.mjs' in js or 'buildQuadChassisArmTemplate' in js
    assert "'build'" in js or '"build"' in js


def test_snapshot_includes_part_defs(tmp_path):
    store = GameStore(tmp_path)
    state = store.get()
    assert 'part_defs' in state
    by_id = {p['id']: p for p in state['part_defs']}
    assert 'core' in by_id
    assert by_id['core']['size_m'] == [0.08, 0.08, 0.08]
    assert any(cp['id'] == 'mount_top' for cp in by_id['core']['connection_points'])
    assert by_id['core']['mass_kg'] > 0
    assert 'behaviors' in by_id['wheel']


def test_enter_exit_yard_preserves_blueprint_id_and_instances(tmp_path):
    from desktop_robot.game.templates import quad_chassis_arm_blueprint

    store = GameStore(tmp_path)
    before = store.get()
    bp = quad_chassis_arm_blueprint().model_dump(mode='json')
    bp['id'] = before['active_blueprint_id']
    bp['name'] = '试验前机架'
    state = action(store, 'blueprint_replace', blueprint=bp)
    active_id = state['active_blueprint_id']
    active = next(b for b in state['blueprints'] if b['id'] == active_id)
    instance_ids = sorted(i['instance_id'] for i in active['instances'])
    instance_count = len(active['instances'])

    entered = action(store, 'enter_yard')
    assert entered['yard_snapshot']['id'] == active_id
    assert entered['yard_snapshot']['name'] == '试验前机架'
    assert len(entered['yard_snapshot']['instances']) == instance_count
    snap_ids = {i['instance_id'] for i in entered['yard_snapshot']['instances']}
    assert 'gripper-1' in snap_ids
    assert sum(1 for i in entered['yard_snapshot']['instances'] if i['part_id'] == 'wheel') == 4
    assert len(entered['yard_snapshot']['connections']) == 9

    # 模拟试验场期间误改蓝图元数据；exit 应从快照恢复，且不写入运行姿态
    with store.connect() as db:
        raw = json.loads(db.execute('SELECT state FROM game WHERE id=1').fetchone()[0])
        for b in raw['blueprints']:
            if b['id'] == active_id:
                b['name'] = '试验场运行中不应保留'
                break
        db.execute('UPDATE game SET state=? WHERE id=1', (json.dumps(raw, ensure_ascii=False),))

    exited = action(store, 'exit_yard')
    assert exited.get('yard_snapshot') is None
    assert exited['active_blueprint_id'] == active_id
    restored = next(b for b in exited['blueprints'] if b['id'] == active_id)
    assert restored['name'] == '试验前机架'
    assert sorted(i['instance_id'] for i in restored['instances']) == instance_ids
    assert len(restored['instances']) == instance_count

    reset_state = action(store, 'yard_reset')
    assert reset_state['revision'] >= exited['revision']
