from app.db import MAX_LENGTH_SAMPLES, Repository


def test_migrations_idempotent(tmp_path):
    path = tmp_path / "p.db"
    repo = Repository(path)
    assert repo.schema_version() == 2
    repo.close()
    repo = Repository(path)  # re-open runs migrate() again
    assert repo.migrate() == 2
    assert repo.schema_version() == 2


def test_view_crud(tmp_path):
    repo = Repository(tmp_path / "p.db")
    v = repo.create_view("47", "Avenue north")
    assert repo.list_views("47") == [v]
    assert repo.list_views("04") == []
    assert repo.rename_view(v.id, "North").name == "North"
    assert repo.delete_view(v.id)
    assert repo.get_view(v.id) is None


def test_exemplars_reference_flag(tmp_path):
    repo = Repository(tmp_path / "p.db")
    v = repo.create_view("47", "A")
    repo.add_exemplar(v.id, "a.jpg", 120.0, is_reference=True)
    repo.add_exemplar(v.id, "b.jpg", 40.0)
    repo.add_exemplar(v.id, "c.jpg", 90.0, is_reference=True)
    ex = repo.list_exemplars(v.id)
    assert [e.frame_path for e in ex if e.is_reference] == ["c.jpg"]
    assert repo.all_exemplar_paths() == {"a.jpg", "b.jpg", "c.jpg"}


def test_zone_crud_and_cascade(tmp_path):
    repo = Repository(tmp_path / "p.db")
    v = repo.create_view("47", "A")
    z = repo.create_zone(v.id, "Right curb", [(0.1, 0.9), (0.4, 0.4)], 0.04, 0.01)
    assert z.points == [(0.1, 0.9), (0.4, 0.4)]
    z2 = repo.update_zone(z.id, name="Right", min_gap_cars=1.5)
    assert z2.name == "Right" and z2.min_gap_cars == 1.5
    repo.add_length_samples(z.id, [(0.1, 0.05)])
    repo.update_zone(z.id, points=[(0.0, 1.0), (0.5, 0.5)])
    assert repo.length_samples(z.id) == []  # geometry change resets learned lengths
    repo.delete_view(v.id)
    assert repo.get_zone(z.id) is None  # cascade


def test_length_samples_capped(tmp_path):
    repo = Repository(tmp_path / "p.db")
    v = repo.create_view("47", "A")
    z = repo.create_zone(v.id, "Z", [(0, 0), (1, 1)], 0.02, 0.02)
    repo.add_length_samples(z.id, [(i / 100, 0.1) for i in range(MAX_LENGTH_SAMPLES + 10)])
    samples = repo.length_samples(z.id)
    assert len(samples) == MAX_LENGTH_SAMPLES
    assert samples[-1][0] == (MAX_LENGTH_SAMPLES + 9) / 100
