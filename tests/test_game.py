import json
from collections import deque
from concurrent.futures import ThreadPoolExecutor
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
