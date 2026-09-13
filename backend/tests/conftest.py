import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://melati-tuntas.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def patient_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien", "pin": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def staff_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "petugas", "pin": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def some_patient_id(s, staff_token):
    r = s.get(f"{API}/staff/patients", headers={"Authorization": f"Bearer {staff_token}"}, timeout=30)
    assert r.status_code == 200
    return r.json()["patients"][0]["id"]
