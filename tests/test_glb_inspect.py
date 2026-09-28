from pathlib import Path

import pytest

from desktop_robot.studio.glb_inspect import GlbError, inspect_glb


def test_inspect_trellis_static_glb():
    path = Path("data/robots/f7389329-64a2-4088-a0ee-f7dd5036b75a/avatar.glb")
    if not path.is_file():
        pytest.skip("no sample avatar.glb")
    info = inspect_glb(path.read_bytes())
    assert info.mesh_count >= 1
    assert info.has_skins is False
    assert info.animation_count == 0
    assert info.animatable is False


def test_inspect_rejects_garbage():
    with pytest.raises(GlbError):
        inspect_glb(b"not-a-glb")
