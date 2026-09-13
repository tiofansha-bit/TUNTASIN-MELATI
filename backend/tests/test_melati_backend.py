"""Melati TUNTASin backend integration tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://melati-tuntas.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Auth ---------------- #
def test_login_patient(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien", "pin": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "patient" and d["access_token"]


def test_login_staff(s):
    r = s.post(f"{API}/auth/login", json={"username": "petugas", "pin": "1234"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["role"] == "staff"


def test_login_wrong_pin(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien", "pin": "9999"}, timeout=15)
    assert r.status_code == 401


def test_me_patient(s, patient_token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["role"] == "patient"


def test_me_staff(s, staff_token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["role"] == "staff"


# ---------------- RBAC ---------------- #
def test_patient_cannot_access_staff(s, patient_token):
    r = s.get(f"{API}/staff/dashboard", headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
    assert r.status_code == 403


def test_staff_cannot_access_patient(s, staff_token):
    r = s.get(f"{API}/patient/today", headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    assert r.status_code == 403


def test_no_token(s):
    r = s.get(f"{API}/patient/today", timeout=15)
    assert r.status_code == 401


# ---------------- Patient endpoints ---------------- #
def test_patient_today(s, patient_token):
    r = s.get(f"{API}/patient/today", headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("first_name", "treatment_day", "progress_pct", "med_times", "today_status", "motivation"):
        assert k in d


def test_patient_schedule(s, patient_token):
    r = s.get(f"{API}/patient/schedule", headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["days"], list) and len(d["days"]) <= 30


def test_patient_help(s, patient_token):
    r = s.get(f"{API}/patient/help", headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["clinic"]["name"] == "Puskesmas Melati"
    assert len(d["education"]) >= 3


def test_symptom_severe_creates_red_alert(s, staff_token):
    r = s.post(f"{API}/auth/login", json={"username": "pasien18", "pin": "1234"}, timeout=15)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    r = s.post(f"{API}/patient/symptom",
               headers={"Authorization": f"Bearer {tok}"},
               json={"symptoms": ["sesak_napas"], "severity": "ringan"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["is_severe"] is True
    r2 = s.get(f"{API}/staff/alerts?status=baru",
               headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    assert r2.status_code == 200
    red = [a for a in r2.json()["alerts"] if a["priority"] == "merah"]
    assert len(red) >= 1


def test_symptom_mild_not_red(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien19", "pin": "1234"}, timeout=15)
    tok = r.json()["access_token"]
    r = s.post(f"{API}/patient/symptom",
               headers={"Authorization": f"Bearer {tok}"},
               json={"symptoms": ["mual_muntah"], "severity": "ringan"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["is_severe"] is False


def test_unable_creates_orange_alert(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien20", "pin": "1234"}, timeout=15)
    tok = r.json()["access_token"]
    r = s.post(f"{API}/patient/unable",
               headers={"Authorization": f"Bearer {tok}"},
               json={"reason": "Lupa"}, timeout=15)
    assert r.status_code == 200
    assert "menggandakan" in r.json()["message"].lower()


def test_dose_confirm_and_duplicate(s, patient_token):
    h = {"Authorization": f"Bearer {patient_token}"}
    r1 = s.post(f"{API}/patient/dose-confirm", headers=h, json={}, timeout=15)
    assert r1.status_code in (200, 409), r1.text
    r2 = s.post(f"{API}/patient/dose-confirm", headers=h, json={}, timeout=15)
    assert r2.status_code == 409


def test_change_pin(s):
    # Use pasien21 so we don't affect other tests
    r = s.post(f"{API}/auth/login", json={"username": "pasien21", "pin": "1234"}, timeout=15)
    tok = r.json()["access_token"]
    r = s.post(f"{API}/auth/change-pin",
               headers={"Authorization": f"Bearer {tok}"},
               json={"old_pin": "1234", "new_pin": "5678"}, timeout=15)
    assert r.status_code == 200
    # revert
    r = s.post(f"{API}/auth/change-pin",
               headers={"Authorization": f"Bearer {tok}"},
               json={"old_pin": "5678", "new_pin": "1234"}, timeout=15)
    assert r.status_code == 200


def test_logout_all_invalidates(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien17", "pin": "1234"}, timeout=15)
    tok = r.json()["access_token"]
    r = s.post(f"{API}/auth/logout-all", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 401


# ---------------- Staff endpoints ---------------- #
def test_staff_dashboard(s, staff_token):
    r = s.get(f"{API}/staff/dashboard", headers={"Authorization": f"Bearer {staff_token}"}, timeout=30)
    assert r.status_code == 200
    m = r.json()["metrics"]
    assert m["total_active"] >= 15
    assert "red_alerts" in m


def test_staff_patients_list(s, staff_token):
    r = s.get(f"{API}/staff/patients", headers={"Authorization": f"Bearer {staff_token}"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert len(d["patients"]) >= 20
    assert len(d["kelurahans"]) >= 3


def test_staff_patients_filter_search(s, staff_token):
    r = s.get(f"{API}/staff/patients?search=budi",
              headers={"Authorization": f"Bearer {staff_token}"}, timeout=20)
    assert r.status_code == 200
    for p in r.json()["patients"]:
        assert "budi" in p["name"].lower() or "budi" in p["code"].lower()


def test_staff_patients_filter_risk(s, staff_token):
    r = s.get(f"{API}/staff/patients?risk=merah",
              headers={"Authorization": f"Bearer {staff_token}"}, timeout=20)
    assert r.status_code == 200
    for p in r.json()["patients"]:
        assert p["risk_level"] == "merah"


def test_staff_patient_detail(s, staff_token, some_patient_id):
    r = s.get(f"{API}/staff/patients/{some_patient_id}",
              headers={"Authorization": f"Bearer {staff_token}"}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("profile", "calendar", "weekly_adherence", "weights", "symptoms",
              "alerts", "dose_history", "audit"):
        assert k in d


def test_staff_update_plan_writes_audit(s, staff_token, some_patient_id):
    r = s.patch(f"{API}/staff/patients/{some_patient_id}/plan",
                headers={"Authorization": f"Bearer {staff_token}"},
                json={"reminder_interval_min": 45}, timeout=15)
    assert r.status_code == 200
    r2 = s.get(f"{API}/staff/patients/{some_patient_id}",
               headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    assert any(a["action"] == "update_plan" for a in r2.json()["audit"])


def test_staff_alerts_list_and_action(s, staff_token):
    r = s.get(f"{API}/staff/alerts", headers={"Authorization": f"Bearer {staff_token}"}, timeout=20)
    assert r.status_code == 200
    alerts = r.json()["alerts"]
    assert len(alerts) > 0
    target = alerts[0]
    r2 = s.post(f"{API}/staff/alerts/{target['id']}/action",
                headers={"Authorization": f"Bearer {staff_token}"},
                json={"status": "diproses", "note": "TEST_note", "action_type": "hubungi"},
                timeout=15)
    assert r2.status_code == 200
    r3 = s.get(f"{API}/staff/alerts", headers={"Authorization": f"Bearer {staff_token}"}, timeout=20)
    matched = [a for a in r3.json()["alerts"] if a["id"] == target["id"]][0]
    assert matched["status"] == "diproses"
    assert any(x.get("note") == "TEST_note" for x in matched.get("actions", []))
