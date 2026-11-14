"""Pruebas de humo multiplataforma para McHanaq API."""

import os

os.environ.setdefault("MCHANAQ_DATA_DIR", "data/fixtures")
os.environ.setdefault("MCHANAQ_NO_CACHE", "1")

from fastapi.testclient import TestClient
from src.backend.app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["data_loaded"] is True


def test_territories_valid_and_invalid():
    assert client.get("/api/v1/territories?type=province").status_code == 200
    r_bad = client.get("/api/v1/territories?type=otro")
    assert r_bad.status_code == 400
    assert r_bad.json()["code"] == "INVALID_PARAMETER"


def test_date_validation_400_422_404():
    r_400 = client.get("/api/v1/territory-metrics?type=province&date=2026-02-30&sensor=MODIS_TERRA&metric=activity_rate")
    assert r_400.status_code == 400

    r_422 = client.get("/api/v1/territory-metrics?type=province&date=1999-01-01&sensor=MODIS_TERRA&metric=activity_rate")
    assert r_422.status_code == 422

    r_404 = client.get("/api/v1/territories/province/NO_EXISTE/summary?date=2026-09-15&sensor=MODIS_TERRA")
    assert r_404.status_code == 404


def test_daily_summary_activity_and_csv():
    r_sum = client.get("/api/v1/territories/province/1501/summary?date=2026-09-15&sensor=MODIS_TERRA")
    assert r_sum.status_code == 200
    assert r_sum.json()["daily"]["t_suelo_c"] is not None

    r_act = client.get("/api/v1/territories/province/1501/activity?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA")
    assert r_act.status_code == 200
    assert len(r_act.json()["items"]) == 30

    r_csv = client.get("/api/v1/territories/province/1501/export.csv?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA")
    assert r_csv.status_code == 200
    assert "t_suelo_c" in r_csv.text
