from app.frames import FrameStore, make_frame_id


def test_retention_keeps_newest_and_exemplars(tmp_path):
    store = FrameStore(tmp_path, retention=20)
    exemplar_rel = None
    for i in range(25):
        data = f"frame-{i}".encode()
        fid = make_frame_id(1_700_000_000 + i, data)
        store.save("47", fid, data)
        if i == 0:
            # the first frame becomes a view reference: it is copied to the exemplar area
            exemplar_rel = store.save_exemplar(1, data)
    frames = store.list_frames("47")
    assert len(frames) == 20
    assert frames[0].startswith("1700000005-")
    assert store.exemplar_path(exemplar_rel).read_bytes() == b"frame-0"


def test_protected_frames_survive_prune(tmp_path):
    store = FrameStore(tmp_path, retention=2)
    ids = []
    for i in range(3):
        fid = make_frame_id(100 + i, bytes([i]))
        ids.append(fid)
        store.save("04", fid, bytes([i]))
    assert ids[0] not in store.list_frames("04")
    # re-add the oldest frame while protecting it: pruning removes the next oldest instead
    store.save("04", ids[0], b"\x00", protected={ids[0]})
    assert set(store.list_frames("04")) == {ids[0], ids[2]}


def test_path_rejects_traversal(tmp_path):
    store = FrameStore(tmp_path, retention=5)
    assert store.path("47", "../../etc/passwd") is None
    assert store.path("47", "123-deadbeef") is None
