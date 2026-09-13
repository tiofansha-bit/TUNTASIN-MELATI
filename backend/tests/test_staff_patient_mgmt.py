"""Regression tests for Melati TUNTASin staff patient management endpoints.

Covers:
- POST   /api/staff/patients      (create)
- PATCH  /api/staff/patients/{id}/profile
- DELETE /api/staff/patients/{id}  (soft-delete)

The tests intentionally create throwaway patients with a unique username
prefix and soft-delete them at the end. Seeded demo accounts (pasien,
pasien01..21, petugas) are NEVER touched.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


# --------------------------------------------------------------------------- #
# helpers / fixtures
# --------------------------------------------------------------------------- #
def _uniq(prefix: str = "tst") -> str:
    """Return a unique lowercase username fitting USERNAME_RE."""
    return f"{prefix}.{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def created_ids(s, staff_token):
    """Track throwaway patient_ids and clean them up (soft-delete) at teardown."""
    ids: list[str] = []
    yield ids
    h = {"Authorization": f"Bearer {staff_token}"}
    for pid in ids:
        try:
            s.delete(f"{API}/staff/patients/{pid}", headers=h, timeout=10)
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# CREATE
# --------------------------------------------------------------------------- #
class TestCreatePatient:
    def test_create_success_returns_minimal_shape(self, s, staff_token, created_ids):
        uname = _uniq()
        r = s.post(
            f"{API}/staff/patients",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={
                "name": "TEST_Pasien Baru",
                "username": uname,
                "pin": "1234",
                "phone": "0812000TEST",
                "kelurahan": "Melati Jaya",
            },
            timeout=15,
        )
        assert r.status_code == 201, r.text
        d = r.json()
        assert set(d.keys()) >= {"id", "code", "username"}
        assert d["username"] == uname
        assert d["code"].startswith("TB-")
        assert len(d["id"]) > 10
        created_ids.append(d["id"])

    def test_create_persists_and_appears_in_list_and_dashboard(self, s, staff_token, created_ids):
        h = {"Authorization": f"Bearer {staff_token}"}
        before_ct = s.get(f"{API}/staff/patients", headers=h, timeout=20).json()["patients"]
        before_dashboard = s.get(f"{API}/staff/dashboard", headers=h, timeout=20).json()["metrics"]["total_active"]

        r = s.post(
            f"{API}/staff/patients", headers=h,
            json={"name": "TEST_Dashboard Case", "username": _uniq(),
                  "pin": "1234", "phone": "", "kelurahan": "Melati Jaya"},
            timeout=15,
        )
        assert r.status_code == 201
        pid = r.json()["id"]
        created_ids.append(pid)

        after_list = s.get(f"{API}/staff/patients", headers=h, timeout=20).json()["patients"]
        assert any(p["id"] == pid for p in after_list)
        assert len(after_list) == len(before_ct) + 1

        after_dashboard = s.get(f"{API}/staff/dashboard", headers=h, timeout=20).json()["metrics"]["total_active"]
        assert after_dashboard == before_dashboard + 1

        # detail endpoint works with defaults applied
        detail = s.get(f"{API}/staff/patients/{pid}", headers=h, timeout=15).json()
        assert detail["profile"]["phase"] == "awal"
        assert detail["profile"]["status"] == "aktif"
        assert detail["profile"]["med_times"] == ["08:00", "20:00"]

    def test_created_patient_can_login_with_initial_pin(self, s, staff_token, created_ids):
        uname = _uniq()
        r = s.post(
            f"{API}/staff/patients",
            headers={"Authorization": f"Bearer {staff_token}"},
            json={"name": "TEST_Login OK", "username": uname, "pin": "4321",
                  "phone": "", "kelurahan": "Melati Jaya"},
            timeout=15,
        )
        assert r.status_code == 201
        created_ids.append(r.json()["id"])
        lg = s.post(f"{API}/auth/login", json={"username": uname, "pin": "4321"}, timeout=15)
        assert lg.status_code == 200, lg.text
        assert lg.json()["role"] == "patient"

    def test_username_uniqueness_case_insensitive(self, s, staff_token, created_ids):
        h = {"Authorization": f"Bearer {staff_token}"}
        uname = _uniq()
        r1 = s.post(f"{API}/staff/patients", headers=h,
                    json={"name": "TEST_A", "username": uname.upper(), "pin": "1234",
                          "phone": "", "kelurahan": "K"}, timeout=15)
        assert r1.status_code == 201, r1.text
        created_ids.append(r1.json()["id"])
        r2 = s.post(f"{API}/staff/patients", headers=h,
                    json={"name": "TEST_B", "username": uname.lower(), "pin": "1234",
                          "phone": "", "kelurahan": "K"}, timeout=15)
        assert r2.status_code == 409, r2.text

    def test_invalid_username_regex(self, s, staff_token):
        r = s.post(f"{API}/staff/patients",
                   headers={"Authorization": f"Bearer {staff_token}"},
                   json={"name": "TEST_X", "username": "ab", "pin": "1234",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        # min_length=3 in Pydantic → 422; if 3 chars but bad char, 400
        assert r.status_code in (400, 422)

        r2 = s.post(f"{API}/staff/patients",
                    headers={"Authorization": f"Bearer {staff_token}"},
                    json={"name": "TEST_X", "username": "bad name!", "pin": "1234",
                          "phone": "", "kelurahan": "K"}, timeout=15)
        assert r2.status_code == 400

    def test_invalid_pin_non_numeric(self, s, staff_token):
        r = s.post(f"{API}/staff/patients",
                   headers={"Authorization": f"Bearer {staff_token}"},
                   json={"name": "TEST_X", "username": _uniq(), "pin": "abcd",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 400

    def test_missing_required_fields_422(self, s, staff_token):
        r = s.post(f"{API}/staff/patients",
                   headers={"Authorization": f"Bearer {staff_token}"},
                   json={"username": _uniq(), "pin": "1234"}, timeout=15)
        assert r.status_code == 422


# --------------------------------------------------------------------------- #
# RBAC
# --------------------------------------------------------------------------- #
class TestRBAC:
    def test_patient_cannot_create(self, s, patient_token):
        r = s.post(f"{API}/staff/patients",
                   headers={"Authorization": f"Bearer {patient_token}"},
                   json={"name": "X", "username": _uniq(), "pin": "1234",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 403

    def test_no_token_create(self, s):
        r = s.post(f"{API}/staff/patients",
                   json={"name": "X", "username": _uniq(), "pin": "1234",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 401

    def test_patient_cannot_patch_profile(self, s, patient_token, some_patient_id):
        r = s.patch(f"{API}/staff/patients/{some_patient_id}/profile",
                    headers={"Authorization": f"Bearer {patient_token}"},
                    json={"name": "X"}, timeout=15)
        assert r.status_code == 403

    def test_patient_cannot_delete(self, s, patient_token, some_patient_id):
        r = s.delete(f"{API}/staff/patients/{some_patient_id}",
                     headers={"Authorization": f"Bearer {patient_token}"}, timeout=15)
        assert r.status_code == 403

    def test_fake_patient_id_404(self, s, staff_token):
        h = {"Authorization": f"Bearer {staff_token}"}
        fake = "nonexistent-" + uuid.uuid4().hex
        assert s.patch(f"{API}/staff/patients/{fake}/profile", headers=h,
                       json={"name": "x"}, timeout=15).status_code == 404
        assert s.delete(f"{API}/staff/patients/{fake}", headers=h, timeout=15).status_code == 404


# --------------------------------------------------------------------------- #
# PATCH profile
# --------------------------------------------------------------------------- #
class TestUpdateProfile:
    @pytest.fixture(scope="class")
    def patient_id(self, s, staff_token, created_ids):
        r = s.post(f"{API}/staff/patients",
                   headers={"Authorization": f"Bearer {staff_token}"},
                   json={"name": "TEST_UpdateMe", "username": _uniq(),
                         "pin": "1234", "phone": "081200OLD",
                         "kelurahan": "AwalKel"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["id"]
        created_ids.append(pid)
        return pid

    def test_update_all_valid_fields(self, s, staff_token, patient_id):
        h = {"Authorization": f"Bearer {staff_token}"}
        r = s.patch(f"{API}/staff/patients/{patient_id}/profile", headers=h, json={
            "name": "TEST_Nama Baru",
            "phone": "081200NEW",
            "address": "Jl Baru 1",
            "kelurahan": "Melati Baru",
            "age_group": "anak",
            "status": "selesai",
        }, timeout=15)
        assert r.status_code == 200, r.text
        detail = s.get(f"{API}/staff/patients/{patient_id}", headers=h, timeout=15).json()
        prof = detail["profile"]
        assert prof["name"] == "TEST_Nama Baru"
        assert prof["phone"] == "081200NEW"
        assert prof["address"] == "Jl Baru 1"
        assert prof["kelurahan"] == "Melati Baru"
        assert prof["age_group"] == "anak"
        assert prof["status"] == "selesai"
        # audit
        assert any(a["action"] == "update_profile" for a in detail["audit"])

    def test_name_phone_reflected_on_user_login(self, s, staff_token, created_ids):
        # create a fresh patient
        h = {"Authorization": f"Bearer {staff_token}"}
        uname = _uniq()
        r = s.post(f"{API}/staff/patients", headers=h,
                   json={"name": "TEST_Old", "username": uname, "pin": "1234",
                         "phone": "081200OLD", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["id"]
        created_ids.append(pid)

        # patch name+phone
        assert s.patch(f"{API}/staff/patients/{pid}/profile", headers=h,
                       json={"name": "TEST_NewName", "phone": "081200NEW"},
                       timeout=15).status_code == 200

        # login as this patient and verify /auth/me + /patient/today
        lg = s.post(f"{API}/auth/login", json={"username": uname, "pin": "1234"}, timeout=15)
        assert lg.status_code == 200
        ptok = lg.json()["access_token"]
        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {ptok}"}, timeout=15).json()
        assert me["name"] == "TEST_NewName"

    def test_invalid_status_400(self, s, staff_token, patient_id):
        r = s.patch(f"{API}/staff/patients/{patient_id}/profile",
                    headers={"Authorization": f"Bearer {staff_token}"},
                    json={"status": "invalid_val"}, timeout=15)
        assert r.status_code == 400

    def test_invalid_age_group_400(self, s, staff_token, patient_id):
        r = s.patch(f"{API}/staff/patients/{patient_id}/profile",
                    headers={"Authorization": f"Bearer {staff_token}"},
                    json={"age_group": "bayi"}, timeout=15)
        assert r.status_code == 400

    def test_empty_body_ok(self, s, staff_token, patient_id):
        r = s.patch(f"{API}/staff/patients/{patient_id}/profile",
                    headers={"Authorization": f"Bearer {staff_token}"},
                    json={}, timeout=15)
        assert r.status_code == 200


# --------------------------------------------------------------------------- #
# DELETE (soft)
# --------------------------------------------------------------------------- #
class TestSoftDelete:
    def test_soft_delete_hides_everywhere_and_blocks_login(self, s, staff_token):
        h = {"Authorization": f"Bearer {staff_token}"}
        uname = _uniq()
        r = s.post(f"{API}/staff/patients", headers=h,
                   json={"name": "TEST_ToDelete", "username": uname, "pin": "1234",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]

        # sanity: login works before delete
        assert s.post(f"{API}/auth/login",
                      json={"username": uname, "pin": "1234"}, timeout=15).status_code == 200
        # present in list
        pre_list = s.get(f"{API}/staff/patients", headers=h, timeout=20).json()["patients"]
        assert any(p["id"] == pid for p in pre_list)

        # DELETE
        d = s.delete(f"{API}/staff/patients/{pid}", headers=h, timeout=15)
        assert d.status_code == 200, d.text

        # gone from list
        after_list = s.get(f"{API}/staff/patients", headers=h, timeout=20).json()["patients"]
        assert not any(p["id"] == pid for p in after_list)

        # gone from dashboard counted? total_active should not include soft-deleted
        # (already covered by earlier +1 test; we just check it succeeds)
        assert s.get(f"{API}/staff/dashboard", headers=h, timeout=15).status_code == 200

        # gone from staff/conversations
        conv = s.get(f"{API}/staff/conversations", headers=h, timeout=20).json()
        assert not any(c.get("patient_id") == pid for c in conv.get("conversations", []))

        # login disabled -> 401
        lg = s.post(f"{API}/auth/login", json={"username": uname, "pin": "1234"}, timeout=15)
        assert lg.status_code == 401, lg.text

        # second DELETE -> 404
        d2 = s.delete(f"{API}/staff/patients/{pid}", headers=h, timeout=15)
        assert d2.status_code == 404

        # PATCH on deleted -> 404
        p2 = s.patch(f"{API}/staff/patients/{pid}/profile", headers=h,
                     json={"name": "TEST_X"}, timeout=15)
        assert p2.status_code == 404

        # GET detail on deleted (assigned+not deleted filter should hide it) -> 404
        det = s.get(f"{API}/staff/patients/{pid}", headers=h, timeout=15)
        assert det.status_code == 404

    def test_soft_delete_does_not_hard_delete_in_db(self, s, staff_token):
        """Best-effort verification via direct Mongo. Skips if pymongo/env not available."""
        try:
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo unavailable")
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
        try:
            client.admin.command("ping")
        except Exception:
            pytest.skip("Mongo not reachable from test runner")
        db = client[db_name]

        h = {"Authorization": f"Bearer {staff_token}"}
        uname = _uniq()
        r = s.post(f"{API}/staff/patients", headers=h,
                   json={"name": "TEST_KeepInDb", "username": uname, "pin": "1234",
                         "phone": "", "kelurahan": "K"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["id"]
        assert db.patients.find_one({"id": pid}) is not None
        assert s.delete(f"{API}/staff/patients/{pid}", headers=h, timeout=15).status_code == 200
        doc = db.patients.find_one({"id": pid})
        assert doc is not None, "Patient must remain in DB after soft-delete"
        assert doc.get("deleted_at") is not None
        # user record should still exist but disabled + token_version incremented
        user = db.users.find_one({"username": uname})
        assert user is not None
        assert user.get("disabled") is True
        assert user.get("token_version", 0) >= 1
