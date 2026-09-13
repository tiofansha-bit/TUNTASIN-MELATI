"""Melati TUNTASin chat feature backend tests.

Covers:
- Patient chat send/list/unread
- Staff chat send/list/unread + conversation ordering
- Read-receipt mutation on thread open
- Role enforcement (403) and access to un-assigned patient (404)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Helpers ---------------- #
def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def patient_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": "pasien", "pin": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def staff_tok(s):
    r = s.post(f"{API}/auth/login", json={"username": "petugas", "pin": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def my_patient_id(s, patient_tok):
    r = s.get(f"{API}/auth/me", headers=_auth(patient_tok), timeout=15)
    assert r.status_code == 200
    return r.json().get("patient_id") or r.json().get("id")


# ---------------- Patient chat ---------------- #
def test_patient_get_messages_includes_hours_and_clinic(s, patient_tok):
    r = s.get(f"{API}/patient/messages", headers=_auth(patient_tok), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "messages" in d and isinstance(d["messages"], list)
    assert "chat_hours" in d
    assert d.get("clinic_name")


def test_patient_send_message_appears_in_thread(s, patient_tok):
    body = {"text": "TEST_PATIENT_MSG_" + str(int(time.time()))}
    r = s.post(f"{API}/patient/messages", headers=_auth(patient_tok), json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sender_role"] == "patient"
    assert d["text"] == body["text"]
    assert d["read_by_patient"] is True
    assert d["read_by_staff"] is False

    # Verify persistence via GET
    r2 = s.get(f"{API}/patient/messages", headers=_auth(patient_tok), timeout=15)
    assert r2.status_code == 200
    texts = [m["text"] for m in r2.json()["messages"]]
    assert body["text"] in texts


def test_patient_send_empty_rejected(s, patient_tok):
    # Pydantic min_length=1 or strip -> should reject
    r = s.post(f"{API}/patient/messages", headers=_auth(patient_tok), json={"text": ""}, timeout=15)
    assert r.status_code in (400, 422), r.text


# ---------------- Staff chat + read receipts ---------------- #
def test_staff_conversations_lists_patient(s, staff_tok, patient_tok):
    # Ensure at least one patient message exists
    s.post(f"{API}/patient/messages", headers=_auth(patient_tok),
           json={"text": "TEST_convo_seed_" + str(int(time.time()))}, timeout=15)
    r = s.get(f"{API}/staff/conversations", headers=_auth(staff_tok), timeout=20)
    assert r.status_code == 200, r.text
    convos = r.json()["conversations"]
    assert len(convos) >= 1
    # required fields
    for c in convos:
        for k in ("patient_id", "name", "code", "last_text", "last_at", "unread"):
            assert k in c


def test_staff_conversations_unread_sorted_first(s, staff_tok, patient_tok):
    # Patient sends msg -> unread should be > 0 on that convo AND it should be first
    tag = "TEST_unread_top_" + str(int(time.time()))
    r = s.post(f"{API}/patient/messages", headers=_auth(patient_tok),
               json={"text": tag}, timeout=15)
    assert r.status_code == 200
    pid_expected = r.json()["patient_id"]

    r = s.get(f"{API}/staff/conversations", headers=_auth(staff_tok), timeout=20)
    assert r.status_code == 200
    convos = r.json()["conversations"]
    assert convos[0]["unread"] >= 1
    # Any convo with unread>0 must come before all with unread==0
    seen_zero = False
    for c in convos:
        if c["unread"] == 0:
            seen_zero = True
        else:
            assert not seen_zero, "Convo with unread>0 appeared after unread==0 convo"
    # our target patient should be present in convos
    assert any(c["patient_id"] == pid_expected for c in convos)


def test_staff_thread_marks_patient_msgs_read(s, staff_tok, patient_tok):
    # Send a fresh patient message
    tag = "TEST_read_receipt_" + str(int(time.time()))
    r = s.post(f"{API}/patient/messages", headers=_auth(patient_tok),
               json={"text": tag}, timeout=15)
    assert r.status_code == 200
    pid = r.json()["patient_id"]

    # Unread before
    before = s.get(f"{API}/staff/messages/unread", headers=_auth(staff_tok), timeout=15).json()["count"]
    assert before >= 1

    # Staff opens thread -> should mark read
    r2 = s.get(f"{API}/staff/patients/{pid}/messages", headers=_auth(staff_tok), timeout=15)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert "messages" in d and "patient" in d
    assert d["patient"]["id"] == pid

    after = s.get(f"{API}/staff/messages/unread", headers=_auth(staff_tok), timeout=15).json()["count"]
    assert after == 0

    # In conversations list, that patient should now have unread == 0
    convos = s.get(f"{API}/staff/conversations", headers=_auth(staff_tok), timeout=20).json()["conversations"]
    target = [c for c in convos if c["patient_id"] == pid][0]
    assert target["unread"] == 0


def test_staff_reply_and_patient_unread(s, staff_tok, patient_tok):
    # Need patient_id - get from conversations
    convos = s.get(f"{API}/staff/conversations", headers=_auth(staff_tok), timeout=20).json()["conversations"]
    # Find the "pasien" default patient
    me = s.get(f"{API}/auth/me", headers=_auth(patient_tok), timeout=15).json()
    pid = None
    for c in convos:
        if c.get("code") == me.get("code") or c.get("name") == me.get("name"):
            pid = c["patient_id"]
            break
    if pid is None:
        # fallback: first convo
        pid = convos[0]["patient_id"]

    # First, patient reads current thread to zero out unread
    s.get(f"{API}/patient/messages", headers=_auth(patient_tok), timeout=15)

    tag = "TEST_staff_reply_" + str(int(time.time()))
    r = s.post(f"{API}/staff/patients/{pid}/messages", headers=_auth(staff_tok),
               json={"text": tag}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sender_role"] == "staff"
    assert d["read_by_staff"] is True
    assert d["read_by_patient"] is False

    # Patient unread should reflect the staff reply (>=1 for THIS patient's own thread)
    # Only meaningful if the target pid is the current patient's own thread
    if pid == me.get("id"):
        cnt = s.get(f"{API}/patient/messages/unread", headers=_auth(patient_tok), timeout=15).json()["count"]
        assert cnt >= 1

        # Patient opens thread -> unread becomes 0
        s.get(f"{API}/patient/messages", headers=_auth(patient_tok), timeout=15)
        cnt2 = s.get(f"{API}/patient/messages/unread", headers=_auth(patient_tok), timeout=15).json()["count"]
        assert cnt2 == 0


# ---------------- Role enforcement ---------------- #
def test_patient_endpoints_reject_staff(s, staff_tok):
    r1 = s.get(f"{API}/patient/messages", headers=_auth(staff_tok), timeout=15)
    r2 = s.post(f"{API}/patient/messages", headers=_auth(staff_tok), json={"text": "x"}, timeout=15)
    r3 = s.get(f"{API}/patient/messages/unread", headers=_auth(staff_tok), timeout=15)
    for r in (r1, r2, r3):
        assert r.status_code == 403, r.text


def test_staff_endpoints_reject_patient(s, patient_tok):
    r1 = s.get(f"{API}/staff/conversations", headers=_auth(patient_tok), timeout=15)
    r2 = s.get(f"{API}/staff/messages/unread", headers=_auth(patient_tok), timeout=15)
    for r in (r1, r2):
        assert r.status_code == 403, r.text


def test_staff_cannot_access_unassigned_patient(s, staff_tok):
    fake_id = "nonexistent-patient-xyz-123"
    r = s.get(f"{API}/staff/patients/{fake_id}/messages", headers=_auth(staff_tok), timeout=15)
    assert r.status_code == 404
    r2 = s.post(f"{API}/staff/patients/{fake_id}/messages", headers=_auth(staff_tok),
                json={"text": "hi"}, timeout=15)
    assert r2.status_code == 404


def test_no_token_rejected(s):
    r = s.get(f"{API}/patient/messages", timeout=15)
    assert r.status_code == 401
    r = s.get(f"{API}/staff/conversations", timeout=15)
    assert r.status_code == 401
