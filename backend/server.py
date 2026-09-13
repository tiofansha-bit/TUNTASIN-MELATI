"""Melati TUNTASin — TB medication adherence monitoring backend.

Two roles: `patient` and `staff`. Auth is username + PIN (bcrypt) with JWT.
All IDs are uuid strings so MongoDB documents serialize cleanly to JSON.
"""
import os
import uuid
import logging
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta, date, time

import jwt
import bcrypt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_HOURS = int(os.environ.get("ACCESS_HOURS", "12"))

app = FastAPI(title="Melati TUNTASin API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("melati")

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
DUMMY_HASH = bcrypt.hashpw(b"dummy-timing-pin", bcrypt.gensalt(rounds=10))


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_pin(pin: str, stored: Optional[str]) -> bool:
    candidate = stored.encode() if stored else DUMMY_HASH
    try:
        return bcrypt.checkpw(pin.encode(), candidate)
    except (ValueError, TypeError):
        return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def today_str() -> str:
    return date.today().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def issue_token(user: dict) -> str:
    now = now_utc()
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "ver": user.get("token_version", 0),
        "iat": now,
        "exp": now + timedelta(hours=ACCESS_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def audit(actor_id: str, action: str, entity: str, entity_id: str, detail: dict | None = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "actor_id": actor_id,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "detail": detail or {},
        "at": iso(now_utc()),
    })


async def current_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not cred or cred.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token tidak ditemukan")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir, silakan masuk kembali")
    user = await db.users.find_one({"id": payload.get("sub"), "disabled": {"$ne": True}}, {"_id": 0})
    if not user or payload.get("ver") != user.get("token_version", 0):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir, silakan masuk kembali")
    return user


async def require_staff(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "staff":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus petugas")
    return user


async def require_patient(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "patient":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus pasien")
    return user


# --------------------------------------------------------------------------- #
# Domain constants
# --------------------------------------------------------------------------- #
SEVERE_SYMPTOMS = {
    "sesak_napas", "pingsan", "penurunan_kesadaran", "ruam_berat",
    "mata_kulit_kuning", "gangguan_penglihatan", "gangguan_pendengaran",
    "urine_sangat_berkurang",
}

MOTIVATIONS = [
    "Setiap butir obat mendekatkan Anda pada kesembuhan.",
    "Hebat! Teruskan kebiasaan baik ini.",
    "Anda tidak sendiri, kami menemani perjalanan Anda.",
    "Satu langkah kecil hari ini, sembuh untuk selamanya.",
    "Tubuh Anda berterima kasih atas ketekunan Anda.",
]


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    pin: str = Field(min_length=4, max_length=12)


class DoseConfirmBody(BaseModel):
    date: Optional[str] = None
    scheduled_time: Optional[str] = None


class UnableBody(BaseModel):
    reason: str
    note: Optional[str] = ""


class SymptomBody(BaseModel):
    symptoms: List[str]
    severity: str = "ringan"  # ringan | sedang | berat
    started_at: Optional[str] = None
    note: Optional[str] = ""


class AlertActionBody(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = ""
    action_type: Optional[str] = None


class PlanBody(BaseModel):
    phase: Optional[str] = None
    med_times: Optional[List[str]] = None
    med_name: Optional[str] = None
    med_count: Optional[str] = None
    next_pickup_date: Optional[str] = None
    next_control_date: Optional[str] = None
    next_sputum_date: Optional[str] = None
    next_weigh_date: Optional[str] = None
    est_end_date: Optional[str] = None
    treatment_status: Optional[str] = None
    reminder_interval_min: Optional[int] = None


class ChangePinBody(BaseModel):
    old_pin: str
    new_pin: str = Field(min_length=4, max_length=12)


class MessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# --------------------------------------------------------------------------- #
# Derived analytics
# --------------------------------------------------------------------------- #
async def dose_map(patient_id: str, since: date) -> dict:
    cur = db.dose_confirmations.find(
        {"patient_id": patient_id, "date": {"$gte": since.isoformat()}}, {"_id": 0}
    )
    out = {}
    async for d in cur:
        out[d["date"]] = d
    return out


def treatment_day(patient: dict) -> int:
    try:
        start = date.fromisoformat(patient["start_date"])
    except Exception:
        return 1
    return max(1, (date.today() - start).days + 1)


async def compute_adherence(patient_id: str, start_date: str, days: int) -> dict:
    """Return taken/expected for the last `days` days (not exceeding treatment start)."""
    try:
        start = date.fromisoformat(start_date)
    except Exception:
        start = date.today()
    window_start = max(start, date.today() - timedelta(days=days - 1))
    dmap = await dose_map(patient_id, window_start)
    expected = 0
    taken = 0
    d = window_start
    while d <= date.today():
        expected += 1
        rec = dmap.get(d.isoformat())
        if rec and rec["status"] in ("taken", "late"):
            taken += 1
        d += timedelta(days=1)
    pct = round((taken / expected) * 100) if expected else 100
    return {"taken": taken, "expected": expected, "pct": pct}


async def latest_dose(patient_id: str) -> Optional[dict]:
    return await db.dose_confirmations.find_one(
        {"patient_id": patient_id, "status": {"$in": ["taken", "late"]}},
        {"_id": 0}, sort=[("confirmed_at", -1)]
    )


async def unconfirmed_count(patient: dict) -> int:
    """Count expected dose-days with no taken/late/reported record, up to yesterday."""
    try:
        start = date.fromisoformat(patient["start_date"])
    except Exception:
        return 0
    window_start = max(start, date.today() - timedelta(days=6))
    dmap = await dose_map(patient["id"], window_start)
    count = 0
    d = window_start
    while d < date.today():  # exclude today (may still be pending)
        rec = dmap.get(d.isoformat())
        if not rec or rec["status"] == "pending":
            count += 1
        d += timedelta(days=1)
    return count


async def last_symptom(patient_id: str) -> Optional[dict]:
    return await db.symptom_reports.find_one(
        {"patient_id": patient_id}, {"_id": 0}, sort=[("reported_at", -1)]
    )


async def open_severe_alert(patient_id: str) -> bool:
    doc = await db.alerts.find_one(
        {"patient_id": patient_id, "priority": "merah", "status": {"$ne": "selesai"}}
    )
    return doc is not None


def date_overdue(value: Optional[str], grace_days: int = 0) -> bool:
    if not value:
        return False
    try:
        return date.fromisoformat(value) < (date.today() - timedelta(days=grace_days))
    except Exception:
        return False


def date_due_within(value: Optional[str], days: int) -> bool:
    if not value:
        return False
    try:
        return date.today() <= date.fromisoformat(value) <= date.today() + timedelta(days=days)
    except Exception:
        return False


async def compute_risk(patient: dict) -> dict:
    """Return {level, reasons[]}. Thresholds configurable per staff config."""
    reasons = []
    level = "hijau"

    if await open_severe_alert(patient["id"]):
        return {"level": "merah", "reasons": ["Keluhan berpotensi berat"]}

    unconf = await unconfirmed_count(patient)
    adh7 = await compute_adherence(patient["id"], patient["start_date"], 7)
    sym = await last_symptom(patient["id"])

    def bump(target):
        nonlocal level
        order = ["hijau", "kuning", "oranye", "merah"]
        if order.index(target) > order.index(level):
            level = target

    if unconf >= 3:
        bump("merah"); reasons.append("Tidak ada konfirmasi beberapa hari")
    elif unconf == 2:
        bump("oranye"); reasons.append("Beberapa dosis belum terkonfirmasi")
    elif unconf == 1:
        bump("kuning"); reasons.append("Satu dosis belum terkonfirmasi")

    if adh7["pct"] < 60:
        bump("oranye"); reasons.append("Kepatuhan menurun")

    if date_overdue(patient.get("next_pickup_date")):
        bump("oranye"); reasons.append("Pengambilan obat terlambat")
    elif date_due_within(patient.get("next_pickup_date"), 2):
        bump("oranye"); reasons.append("Obat hampir habis")
    if date_overdue(patient.get("next_control_date"), grace_days=2):
        bump("oranye"); reasons.append("Kontrol terlambat")
    elif date_overdue(patient.get("next_control_date")):
        bump("kuning"); reasons.append("Kontrol jatuh tempo")

    if sym and sym.get("severity") == "berat":
        bump("merah"); reasons.append("Keluhan berat belum ditindaklanjuti")
    elif sym and sym.get("severity") == "sedang":
        bump("kuning"); reasons.append("Keluhan sedang")

    if patient.get("risk_override"):
        bump(patient["risk_override"]); reasons.append("Ditetapkan petugas")

    if not reasons:
        reasons.append("Kepatuhan baik, tidak ada masalah aktif")
    return {"level": level, "reasons": reasons}


async def create_alert(patient: dict, atype: str, cause: str, priority: str):
    due_hours = {"merah": 2, "oranye": 12, "kuning": 24}.get(priority, 24)
    doc = {
        "id": new_id(),
        "patient_id": patient["id"],
        "patient_name": patient["name"],
        "patient_code": patient["code"],
        "kelurahan": patient.get("kelurahan"),
        "type": atype,
        "cause": cause,
        "priority": priority,
        "status": "baru",
        "created_at": iso(now_utc()),
        "due_at": iso(now_utc() + timedelta(hours=due_hours)),
        "first_response_at": None,
        "resolved_at": None,
        "notes": [],
        "actions": [],
    }
    await db.alerts.insert_one(doc)
    return doc


# --------------------------------------------------------------------------- #
# Auth routes
# --------------------------------------------------------------------------- #
@api.get("/")
async def root():
    return {"app": "Melati TUNTASin", "status": "ok"}


@api.post("/auth/login")
async def login(body: LoginBody):
    username = body.username.strip().lower()
    user = await db.users.find_one({"username": username, "disabled": {"$ne": True}})
    if not verify_pin(body.pin, user.get("pin_hash") if user else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Username atau PIN salah")
    token = issue_token(user)
    await audit(user["id"], "login", "user", user["id"])
    return {
        "access_token": token,
        "role": user["role"],
        "name": user.get("name"),
        "expires_in": ACCESS_HOURS * 3600,
    }


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    out = {"id": user["id"], "username": user["username"], "role": user["role"], "name": user.get("name")}
    if user["role"] == "patient":
        p = await db.patients.find_one({"user_id": user["id"]}, {"_id": 0})
        if p:
            out["patient_id"] = p["id"]
    return out


@api.post("/auth/logout-all")
async def logout_all(user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$inc": {"token_version": 1}})
    return {"ok": True}


@api.post("/auth/change-pin")
async def change_pin(body: ChangePinBody, user: dict = Depends(current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_pin(body.old_pin, full.get("pin_hash")):
        raise HTTPException(400, "PIN lama salah")
    if not body.new_pin.isdigit():
        raise HTTPException(400, "PIN harus berupa angka")
    await db.users.update_one({"id": user["id"]}, {"$set": {"pin_hash": hash_pin(body.new_pin)}})
    await audit(user["id"], "change_pin", "user", user["id"])
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Patient routes
# --------------------------------------------------------------------------- #
async def get_my_patient(user: dict) -> dict:
    p = await db.patients.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Data pasien tidak ditemukan")
    return p


@api.get("/patient/today")
async def patient_today(user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    tday = today_str()
    conf = await db.dose_confirmations.find_one(
        {"patient_id": p["id"], "date": tday}, {"_id": 0}
    )
    adh = await compute_adherence(p["id"], p["start_date"], 30)
    day = treatment_day(p)
    total_days = 180
    try:
        start = date.fromisoformat(p["start_date"])
        end = date.fromisoformat(p["est_end_date"])
        total_days = max(1, (end - start).days)
    except Exception:
        pass
    unable = await db.unable_reports.find_one(
        {"patient_id": p["id"], "date": tday}, {"_id": 0}, sort=[("reported_at", -1)]
    )
    return {
        "first_name": p["name"].split(" ")[0],
        "treatment_day": day,
        "total_days": total_days,
        "progress_pct": min(100, round((day / total_days) * 100)),
        "phase": p.get("phase", "awal"),
        "med_times": p.get("med_times", []),
        "med_name": p.get("med_name", "Obat sesuai resep petugas"),
        "today_status": conf["status"] if conf else "pending",
        "today_confirmed_at": conf.get("confirmed_at") if conf else None,
        "today_unable_reason": unable.get("reason") if unable else None,
        "adherence_30": adh,
        "next_pickup_date": p.get("next_pickup_date"),
        "next_control_date": p.get("next_control_date"),
        "next_sputum_date": p.get("next_sputum_date"),
        "next_weigh_date": p.get("next_weigh_date"),
        "motivation": random.choice(MOTIVATIONS),
        "clinic": await db.settings.find_one({"id": "clinic"}, {"_id": 0}),
    }


@api.post("/patient/dose-confirm")
async def dose_confirm(body: DoseConfirmBody, user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    d = body.date or today_str()
    existing = await db.dose_confirmations.find_one({"patient_id": p["id"], "date": d})
    if existing and existing["status"] in ("taken", "late"):
        raise HTTPException(409, "Sudah tercatat untuk hari ini")

    late = False
    times = p.get("med_times", [])
    if times:
        try:
            hh, mm = times[0].split(":")
            deadline = datetime.combine(date.today(), time(int(hh), int(mm))) + timedelta(hours=3)
            late = datetime.now() > deadline and d == today_str()
        except Exception:
            late = False
    st = "late" if late else "taken"
    doc = {
        "patient_id": p["id"],
        "date": d,
        "scheduled_time": (times[0] if times else None),
        "status": st,
        "confirmed_at": iso(now_utc()),
        "sync_status": "synced",
        "corrected": False,
    }
    await db.dose_confirmations.update_one(
        {"patient_id": p["id"], "date": d}, {"$set": doc}, upsert=True
    )
    await audit(user["id"], "dose_confirm", "dose", f"{p['id']}:{d}", {"status": st})
    return {
        "status": st,
        "message": "Terima kasih. Satu langkah lagi menuju sembuh.",
        "late": late,
    }


@api.post("/patient/unable")
async def report_unable(body: UnableBody, user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    d = today_str()
    rec = {
        "id": new_id(),
        "patient_id": p["id"],
        "date": d,
        "reason": body.reason,
        "note": body.note,
        "reported_at": iso(now_utc()),
    }
    await db.unable_reports.insert_one(rec)
    await db.dose_confirmations.update_one(
        {"patient_id": p["id"], "date": d},
        {"$set": {
            "patient_id": p["id"], "date": d, "status": "reported",
            "confirmed_at": iso(now_utc()), "sync_status": "synced",
            "unable_reason": body.reason,
        }},
        upsert=True,
    )
    await create_alert(p, "tidak_minum", f"Pasien melapor: {body.reason}", "oranye")
    await audit(user["id"], "report_unable", "dose", f"{p['id']}:{d}", {"reason": body.reason})
    return {
        "ok": True,
        "message": "Jangan menggandakan dosis atau mengubah pengobatan sendiri. Petugas akan membantu menentukan langkah selanjutnya.",
    }


@api.post("/patient/symptom")
async def report_symptom(body: SymptomBody, user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    severe = body.severity == "berat" or any(s in SEVERE_SYMPTOMS for s in body.symptoms)
    rec = {
        "id": new_id(),
        "patient_id": p["id"],
        "symptoms": body.symptoms,
        "severity": "berat" if severe else body.severity,
        "started_at": body.started_at,
        "note": body.note,
        "is_severe": severe,
        "reported_at": iso(now_utc()),
    }
    await db.symptom_reports.insert_one(rec)
    priority = "merah" if severe else ("oranye" if body.severity == "sedang" else "kuning")
    await create_alert(p, "efek_samping", f"Keluhan: {', '.join(body.symptoms)}", priority)
    await audit(user["id"], "report_symptom", "symptom", rec["id"], {"severe": severe})
    msg = ("Keluhan ini perlu segera dinilai tenaga kesehatan. Hubungi petugas atau segera datang ke "
           "fasilitas pelayanan kesehatan. Jangan mengubah atau menghentikan pengobatan sendiri tanpa "
           "arahan tenaga kesehatan.") if severe else \
          "Terima kasih sudah melapor. Petugas akan meninjau keluhan Anda."
    return {"ok": True, "is_severe": severe, "message": msg}


@api.get("/patient/schedule")
async def patient_schedule(user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    start = max(date.fromisoformat(p["start_date"]), date.today() - timedelta(days=29))
    dmap = await dose_map(p["id"], start)
    days = []
    d = start
    while d <= date.today():
        rec = dmap.get(d.isoformat())
        if rec:
            status_v = rec["status"]
        else:
            status_v = "pending" if d < date.today() else "notyet"
        days.append({"date": d.isoformat(), "status": status_v})
        d += timedelta(days=1)
    return {
        "days": days,
        "med_times": p.get("med_times", []),
        "next_pickup_date": p.get("next_pickup_date"),
        "next_control_date": p.get("next_control_date"),
        "next_sputum_date": p.get("next_sputum_date"),
        "next_weigh_date": p.get("next_weigh_date"),
        "est_end_date": p.get("est_end_date"),
        "phase": p.get("phase"),
    }


@api.get("/patient/help")
async def patient_help(user: dict = Depends(require_patient)):
    clinic = await db.settings.find_one({"id": "clinic"}, {"_id": 0})
    edu = await db.education.find({}, {"_id": 0}).to_list(50)
    return {"clinic": clinic, "education": edu}


# --------------------------------------------------------------------------- #
# Staff routes
# --------------------------------------------------------------------------- #
async def build_patient_row(p: dict) -> dict:
    adh7 = await compute_adherence(p["id"], p["start_date"], 7)
    adh30 = await compute_adherence(p["id"], p["start_date"], 30)
    risk = await compute_risk(p)
    last = await latest_dose(p["id"])
    sym = await last_symptom(p["id"])
    fu = await db.alerts.find_one(
        {"patient_id": p["id"], "status": {"$ne": "selesai"}}, {"_id": 0}, sort=[("created_at", -1)]
    )
    return {
        "id": p["id"],
        "code": p["code"],
        "name": p["name"],
        "kelurahan": p.get("kelurahan"),
        "phase": p.get("phase"),
        "age_group": p.get("age_group"),
        "status": p.get("status", "aktif"),
        "treatment_day": treatment_day(p),
        "adherence_7": adh7["pct"],
        "adherence_30": adh30["pct"],
        "last_confirmation": last.get("confirmed_at") if last else None,
        "unconfirmed": await unconfirmed_count(p),
        "last_symptom": (sym.get("symptoms") if sym else None),
        "last_symptom_severity": (sym.get("severity") if sym else None),
        "next_pickup_date": p.get("next_pickup_date"),
        "next_control_date": p.get("next_control_date"),
        "next_sputum_date": p.get("next_sputum_date"),
        "risk_level": risk["level"],
        "risk_reasons": risk["reasons"],
        "follow_up_status": fu["status"] if fu else "-",
    }


@api.get("/staff/dashboard")
async def staff_dashboard(user: dict = Depends(require_staff)):
    patients = await db.patients.find({"assigned_staff_ids": user["id"]}, {"_id": 0}).to_list(1000)
    tday = today_str()
    m = {
        "total_active": 0, "took_today": 0, "not_confirmed": 0, "late_confirm": 0,
        "reported_unable": 0, "side_effects": 0, "red_alerts": 0, "meds_low": 0,
        "control_overdue": 0, "sputum_due": 0, "weigh_due": 0, "near_end": 0, "at_risk": 0,
    }
    for p in patients:
        active = p.get("status") == "aktif"
        if active:
            m["total_active"] += 1
        conf = await db.dose_confirmations.find_one({"patient_id": p["id"], "date": tday}, {"_id": 0})
        if conf and conf["status"] == "taken":
            m["took_today"] += 1
        elif conf and conf["status"] == "late":
            m["late_confirm"] += 1
        elif conf and conf["status"] == "reported":
            m["reported_unable"] += 1
        elif active:
            m["not_confirmed"] += 1
        if await last_symptom(p["id"]):
            m["side_effects"] += 1
        if date_due_within(p.get("next_pickup_date"), 2) or date_overdue(p.get("next_pickup_date")):
            m["meds_low"] += 1
        if date_overdue(p.get("next_control_date")):
            m["control_overdue"] += 1
        if date_overdue(p.get("next_sputum_date")):
            m["sputum_due"] += 1
        if date_overdue(p.get("next_weigh_date")):
            m["weigh_due"] += 1
        risk = await compute_risk(p)
        if risk["level"] == "merah":
            m["at_risk"] += 1
        try:
            end = date.fromisoformat(p["est_end_date"])
            if 0 <= (end - date.today()).days <= 21 and active:
                m["near_end"] += 1
        except Exception:
            pass
    m["red_alerts"] = await db.alerts.count_documents(
        {"priority": "merah", "status": {"$ne": "selesai"}}
    )
    return {"metrics": m, "staff_name": user.get("name")}


@api.get("/staff/patients")
async def staff_patients(
    user: dict = Depends(require_staff),
    kelurahan: Optional[str] = None,
    phase: Optional[str] = None,
    risk: Optional[str] = None,
    age_group: Optional[str] = None,
    status_f: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
):
    q = {"assigned_staff_ids": user["id"]}
    if kelurahan:
        q["kelurahan"] = kelurahan
    if phase:
        q["phase"] = phase
    if age_group:
        q["age_group"] = age_group
    if status_f:
        q["status"] = status_f
    patients = await db.patients.find(q, {"_id": 0}).to_list(1000)
    rows = [await build_patient_row(p) for p in patients]
    if risk:
        rows = [r for r in rows if r["risk_level"] == risk]
    if search:
        s = search.lower()
        rows = [r for r in rows if s in r["name"].lower() or s in r["code"].lower()]
    order = {"merah": 0, "oranye": 1, "kuning": 2, "hijau": 3}
    rows.sort(key=lambda r: (order.get(r["risk_level"], 9), -r["unconfirmed"]))
    all_p = await db.patients.find({"assigned_staff_ids": user["id"]}, {"_id": 0, "kelurahan": 1}).to_list(1000)
    kelurahans = sorted({p.get("kelurahan") for p in all_p if p.get("kelurahan")})
    return {"patients": rows, "kelurahans": kelurahans}


@api.get("/staff/patients/{patient_id}")
async def staff_patient_detail(patient_id: str, user: dict = Depends(require_staff)):
    p = await db.patients.find_one({"id": patient_id, "assigned_staff_ids": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Pasien tidak ditemukan")
    row = await build_patient_row(p)
    start = max(date.fromisoformat(p["start_date"]), date.today() - timedelta(days=29))
    dmap = await dose_map(p["id"], start)
    cal = []
    d = start
    while d <= date.today():
        rec = dmap.get(d.isoformat())
        cal.append({"date": d.isoformat(), "status": rec["status"] if rec else "pending"})
        d += timedelta(days=1)
    weekly = []
    for w in range(7, -1, -1):
        ws = date.today() - timedelta(days=(w + 1) * 7 - 1)
        we = date.today() - timedelta(days=w * 7)
        wmap = await dose_map(p["id"], ws)
        exp = tk = 0
        d2 = ws
        while d2 <= we and d2 <= date.today():
            if d2 >= date.fromisoformat(p["start_date"]):
                exp += 1
                r = wmap.get(d2.isoformat())
                if r and r["status"] in ("taken", "late"):
                    tk += 1
            d2 += timedelta(days=1)
        weekly.append({"label": f"M{8 - w}", "pct": round((tk / exp) * 100) if exp else 0})
    weights = await db.weight_records.find({"patient_id": p["id"]}, {"_id": 0}).sort("date", 1).to_list(50)
    symptoms = await db.symptom_reports.find({"patient_id": p["id"]}, {"_id": 0}).sort("reported_at", -1).to_list(50)
    unable = await db.unable_reports.find({"patient_id": p["id"]}, {"_id": 0}).sort("reported_at", -1).to_list(50)
    alerts = await db.alerts.find({"patient_id": p["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    audits = await db.audit_logs.find({"entity_id": {"$regex": f"^{p['id']}"}}, {"_id": 0}).sort("at", -1).to_list(50)
    doses = await db.dose_confirmations.find({"patient_id": p["id"]}, {"_id": 0}).sort("date", -1).to_list(60)
    return {
        "profile": {**p, **row},
        "calendar": cal,
        "weekly_adherence": weekly,
        "weights": weights,
        "symptoms": symptoms,
        "unable_reports": unable,
        "alerts": alerts,
        "dose_history": doses,
        "audit": audits,
    }


@api.patch("/staff/patients/{patient_id}/plan")
async def update_plan(patient_id: str, body: PlanBody, user: dict = Depends(require_staff)):
    p = await db.patients.find_one({"id": patient_id, "assigned_staff_ids": user["id"]})
    if not p:
        raise HTTPException(404, "Pasien tidak ditemukan")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    before = {k: p.get(k) for k in updates}
    await db.patients.update_one({"id": patient_id}, {"$set": updates})
    await audit(user["id"], "update_plan", "patient", patient_id, {"before": before, "after": updates})
    return {"ok": True}


@api.get("/staff/alerts")
async def staff_alerts(user: dict = Depends(require_staff), status_f: Optional[str] = Query(None, alias="status")):
    q = {}
    if status_f:
        q["status"] = status_f
    alerts = await db.alerts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    order = {"merah": 0, "oranye": 1, "kuning": 2}
    alerts.sort(key=lambda a: (a.get("status") == "selesai", order.get(a["priority"], 9)))
    return {"alerts": alerts}


@api.post("/staff/alerts/{alert_id}/action")
async def alert_action(alert_id: str, body: AlertActionBody, user: dict = Depends(require_staff)):
    a = await db.alerts.find_one({"id": alert_id})
    if not a:
        raise HTTPException(404, "Alert tidak ditemukan")
    upd = {}
    now_i = iso(now_utc())
    if not a.get("first_response_at"):
        upd["first_response_at"] = now_i
    if body.status:
        upd["status"] = body.status
        if body.status == "selesai":
            upd["resolved_at"] = now_i
    push = {}
    if body.note or body.action_type:
        push["actions"] = {
            "at": now_i, "by": user.get("name"),
            "type": body.action_type or "catatan", "note": body.note or "",
        }
    op = {}
    if upd:
        op["$set"] = upd
    if push:
        op["$push"] = push
    if op:
        await db.alerts.update_one({"id": alert_id}, op)
    await audit(user["id"], "alert_action", "alert", alert_id,
                {"status": body.status, "type": body.action_type})
    return {"ok": True}


@api.get("/staff/reports")
async def staff_reports(user: dict = Depends(require_staff)):
    patients = await db.patients.find({"assigned_staff_ids": user["id"]}, {"_id": 0}).to_list(1000)
    by_kel = {}
    completed_initial = 0
    completed_treatment = 0
    total_adh = 0
    for p in patients:
        by_kel[p.get("kelurahan")] = by_kel.get(p.get("kelurahan"), 0) + 1
        if p.get("phase") == "lanjutan":
            completed_initial += 1
        if p.get("status") == "selesai":
            completed_treatment += 1
        adh = await compute_adherence(p["id"], p["start_date"], 30)
        total_adh += adh["pct"]
    avg_adh = round(total_adh / len(patients)) if patients else 0
    sym_count = await db.symptom_reports.count_documents({})
    alerts = await db.alerts.find({}, {"_id": 0}).to_list(1000)
    resolved = [a for a in alerts if a.get("resolved_at")]
    return {
        "avg_adherence_30": avg_adh,
        "by_kelurahan": [{"kelurahan": k, "count": v} for k, v in by_kel.items()],
        "completed_initial_phase": completed_initial,
        "completed_treatment": completed_treatment,
        "total_side_effects": sym_count,
        "total_alerts": len(alerts),
        "resolved_alerts": len(resolved),
    }


# --------------------------------------------------------------------------- #
# Chat (patient <-> assigned staff), one thread per patient
# --------------------------------------------------------------------------- #
async def thread_messages(patient_id: str, viewer_role: str) -> list:
    """Return the full thread (oldest first) and mark incoming messages as read."""
    if viewer_role == "patient":
        await db.messages.update_many(
            {"patient_id": patient_id, "sender_role": "staff", "read_by_patient": False},
            {"$set": {"read_by_patient": True}},
        )
    else:
        await db.messages.update_many(
            {"patient_id": patient_id, "sender_role": "patient", "read_by_staff": False},
            {"$set": {"read_by_staff": True}},
        )
    return await db.messages.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)


@api.get("/patient/messages")
async def patient_messages(user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    msgs = await thread_messages(p["id"], "patient")
    clinic = await db.settings.find_one({"id": "clinic"}, {"_id": 0})
    return {
        "messages": msgs,
        "chat_hours": clinic.get("chat_hours") if clinic else None,
        "clinic_name": clinic.get("name") if clinic else "Petugas",
    }


@api.get("/patient/messages/unread")
async def patient_unread(user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    count = await db.messages.count_documents(
        {"patient_id": p["id"], "sender_role": "staff", "read_by_patient": False}
    )
    return {"count": count}


@api.post("/patient/messages")
async def patient_send_message(body: MessageBody, user: dict = Depends(require_patient)):
    p = await get_my_patient(user)
    doc = {
        "id": new_id(), "patient_id": p["id"], "sender_role": "patient",
        "sender_id": user["id"], "sender_name": p["name"], "text": body.text.strip(),
        "created_at": iso(now_utc()), "read_by_patient": True, "read_by_staff": False,
    }
    await db.messages.insert_one(doc)
    await audit(user["id"], "send_message", "message", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/staff/messages/unread")
async def staff_unread(user: dict = Depends(require_staff)):
    pids = [p["id"] for p in await db.patients.find(
        {"assigned_staff_ids": user["id"]}, {"_id": 0, "id": 1}).to_list(1000)]
    count = await db.messages.count_documents(
        {"patient_id": {"$in": pids}, "sender_role": "patient", "read_by_staff": False}
    )
    return {"count": count}


@api.get("/staff/conversations")
async def staff_conversations(user: dict = Depends(require_staff)):
    patients = await db.patients.find({"assigned_staff_ids": user["id"]}, {"_id": 0}).to_list(1000)
    convos = []
    for p in patients:
        last = await db.messages.find_one(
            {"patient_id": p["id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        unread = await db.messages.count_documents(
            {"patient_id": p["id"], "sender_role": "patient", "read_by_staff": False}
        )
        convos.append({
            "patient_id": p["id"], "name": p["name"], "code": p["code"],
            "kelurahan": p.get("kelurahan"),
            "last_text": last["text"] if last else None,
            "last_at": last["created_at"] if last else None,
            "last_sender": last["sender_role"] if last else None,
            "unread": unread,
        })
    convos.sort(key=lambda c: c["last_at"] or "", reverse=True)
    convos.sort(key=lambda c: 0 if c["unread"] > 0 else 1)
    return {"conversations": convos}


@api.get("/staff/patients/{patient_id}/messages")
async def staff_thread(patient_id: str, user: dict = Depends(require_staff)):
    p = await db.patients.find_one({"id": patient_id, "assigned_staff_ids": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Pasien tidak ditemukan")
    msgs = await thread_messages(patient_id, "staff")
    return {"messages": msgs, "patient": {
        "id": p["id"], "name": p["name"], "code": p["code"],
        "phone": p.get("phone"), "kelurahan": p.get("kelurahan"),
    }}


@api.post("/staff/patients/{patient_id}/messages")
async def staff_send_message(patient_id: str, body: MessageBody, user: dict = Depends(require_staff)):
    p = await db.patients.find_one({"id": patient_id, "assigned_staff_ids": user["id"]})
    if not p:
        raise HTTPException(404, "Pasien tidak ditemukan")
    doc = {
        "id": new_id(), "patient_id": patient_id, "sender_role": "staff",
        "sender_id": user["id"], "sender_name": user.get("name", "Petugas"),
        "text": body.text.strip(), "created_at": iso(now_utc()),
        "read_by_patient": False, "read_by_staff": True,
    }
    await db.messages.insert_one(doc)
    await audit(user["id"], "send_message", "message", doc["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


# --------------------------------------------------------------------------- #
# Seed
# --------------------------------------------------------------------------- #
@app.on_event("startup")
async def startup():
    await db.users.create_index("username", unique=True)
    await db.patients.create_index("user_id")
    await db.dose_confirmations.create_index([("patient_id", 1), ("date", 1)])
    await db.messages.create_index([("patient_id", 1), ("created_at", 1)])
    if await db.users.count_documents({}) > 0:
        logger.info("Seed data already present, skipping.")
        return
    await seed()


async def seed():
    logger.info("Seeding Melati TUNTASin demo data...")
    await db.settings.insert_one({
        "id": "clinic",
        "name": "Puskesmas Melati",
        "address": "Jl. Melati No. 12, Kel. Melati Jaya",
        "phone": "081200000000",
        "hours": "Senin–Sabtu, 08.00–14.00 WIB",
        "chat_hours": "08.00–14.00 WIB (hari kerja)",
        "emergency": "119",
        "lat": -6.2, "lng": 106.8,
        "reminder_interval_min": 60,
    })
    await db.education.insert_many([
        {"id": new_id(), "title": "Pentingnya Minum Obat Teratur",
         "body": "Minum obat setiap hari sesuai jadwal membuat pengobatan berhasil. Jangan berhenti walau merasa sudah sehat."},
        {"id": new_id(), "title": "Jika Lupa Minum Obat",
         "body": "Segera minum saat ingat pada hari yang sama. Jangan menggandakan dosis. Beri tahu petugas."},
        {"id": new_id(), "title": "Jangan Berhenti Sendiri",
         "body": "Menghentikan obat tanpa arahan dapat membuat kuman kebal. Selalu konsultasi dengan petugas."},
        {"id": new_id(), "title": "Efek Samping yang Perlu Dilaporkan",
         "body": "Mata/kulit kuning, ruam berat, gangguan penglihatan, atau sesak napas harus segera dilaporkan."},
        {"id": new_id(), "title": "Etika Batuk & Masker",
         "body": "Tutup mulut saat batuk, gunakan masker, dan pastikan ventilasi ruangan baik."},
        {"id": new_id(), "title": "Gizi Selama Pengobatan",
         "body": "Makan bergizi seimbang, cukup protein, sayur, dan buah untuk membantu pemulihan."},
    ])

    staff_id = new_id()
    await db.users.insert_one({
        "id": staff_id, "username": "petugas", "pin_hash": hash_pin("1234"),
        "role": "staff", "name": "Petugas Rina", "token_version": 0, "disabled": False,
        "phone": "081200000001",
    })

    kelurahans = ["Melati Jaya", "Kenanga", "Mawar Indah", "Anggrek", "Cempaka"]
    first_names = ["Budi", "Siti", "Andi", "Dewi", "Rudi", "Ani", "Joko", "Rina", "Agus", "Lina",
                   "Bayu", "Tono", "Wati", "Eka", "Fajar", "Gita", "Hadi", "Indah", "Kiki", "Maya",
                   "Nanda", "Putri"]
    last_names = ["Santoso", "Wijaya", "Pratama", "Lestari", "Saputra", "Handayani", "Kurniawan"]

    scenarios = [
        "patuh", "patuh", "patuh", "terlambat", "belum_konfirmasi", "belum_konfirmasi",
        "lapor_tidak_minum", "keluhan_ringan", "keluhan_berat", "obat_hampir_habis",
        "kontrol_terlambat", "sputum_jatuh_tempo", "tahap_awal", "tahap_lanjutan",
        "selesai", "menurun", "patuh", "terlambat", "keluhan_ringan", "obat_hampir_habis",
        "tahap_lanjutan", "belum_konfirmasi",
    ]

    seed_msgs = []
    for i, scn in enumerate(scenarios):
        pid = new_id()
        uid = new_id()
        fn = first_names[i % len(first_names)]
        name = f"{fn} {random.choice(last_names)}"
        kel = kelurahans[i % len(kelurahans)]
        age_group = "anak" if i % 7 == 0 else "dewasa"
        phase = "awal" if scn == "tahap_awal" or i % 3 == 0 else "lanjutan"
        status_v = "selesai" if scn == "selesai" else "aktif"
        start_offset = random.randint(15, 120)
        start = date.today() - timedelta(days=start_offset)
        est_end = start + timedelta(days=180)

        username = "pasien" if i == 0 else f"pasien{i:02d}"
        await db.users.insert_one({
            "id": uid, "username": username, "pin_hash": hash_pin("1234"),
            "role": "patient", "name": name, "token_version": 0, "disabled": False,
            "phone": f"08130000{i:04d}",
        })

        next_pickup = (date.today() + timedelta(days=random.randint(3, 14))).isoformat()
        next_control = (date.today() + timedelta(days=random.randint(5, 20))).isoformat()
        next_sputum = (date.today() + timedelta(days=random.randint(10, 40))).isoformat()
        next_weigh = (date.today() + timedelta(days=random.randint(7, 25))).isoformat()
        if scn == "obat_hampir_habis":
            next_pickup = (date.today() + timedelta(days=1)).isoformat()
        if scn == "kontrol_terlambat":
            next_control = (date.today() - timedelta(days=4)).isoformat()
        if scn == "sputum_jatuh_tempo":
            next_sputum = (date.today() - timedelta(days=2)).isoformat()

        patient = {
            "id": pid, "user_id": uid, "code": f"TB-2025{i+1:03d}", "name": name,
            "phone": f"08130000{i:04d}", "address": f"Jl. {kel} No. {i+3}",
            "kelurahan": kel, "age_group": age_group,
            "start_date": start.isoformat(), "est_end_date": est_end.isoformat(),
            "phase": phase, "classification": "TB Sensitif Obat",
            "status": status_v, "assigned_staff_ids": [staff_id],
            "med_times": ["08:00"] if age_group == "anak" else ["08:00", "20:00"],
            "med_name": "OAT Kategori 1 (sesuai resep)",
            "med_count": "3 tablet FDC",
            "next_pickup_date": next_pickup, "next_control_date": next_control,
            "next_sputum_date": next_sputum, "next_weigh_date": next_weigh,
            "risk_override": None,
            "reminder_interval_min": 60,
        }
        await db.patients.insert_one(patient)

        docs = []
        d = max(start, date.today() - timedelta(days=29))
        while d <= date.today():
            is_today = d == date.today()
            r = random.random()
            if scn == "patuh":
                st = "taken" if r > 0.05 else "late"
            elif scn == "terlambat":
                st = "late" if r > 0.4 else "taken"
            elif scn == "menurun":
                days_ago = (date.today() - d).days
                st = "taken" if days_ago > 10 else ("pending" if r > 0.5 else "taken")
            elif scn == "belum_konfirmasi":
                st = "taken" if (date.today() - d).days > 3 else None
            elif scn == "lapor_tidak_minum":
                st = "reported" if is_today else ("taken" if r > 0.2 else "pending")
            elif scn == "selesai":
                st = "taken" if r > 0.03 else "late"
            else:
                st = "taken" if r > 0.15 else ("late" if r > 0.08 else "pending")
            if is_today and (scn == "belum_konfirmasi" or i == 0):
                st = None
            if st and st != "pending":
                docs.append({
                    "patient_id": pid, "date": d.isoformat(),
                    "scheduled_time": patient["med_times"][0],
                    "status": st,
                    "confirmed_at": iso(datetime.combine(d, time(8, random.randint(0, 59))).replace(tzinfo=timezone.utc)),
                    "sync_status": "synced", "corrected": False,
                    **({"unable_reason": "Lupa"} if st == "reported" else {}),
                })
            elif st == "pending":
                docs.append({
                    "patient_id": pid, "date": d.isoformat(),
                    "scheduled_time": patient["med_times"][0], "status": "pending",
                    "confirmed_at": None, "sync_status": "synced", "corrected": False,
                })
            d += timedelta(days=1)
        if docs:
            await db.dose_confirmations.insert_many(docs)

        wdocs = []
        base_w = random.randint(45, 65) if age_group == "dewasa" else random.randint(18, 30)
        for wk in range(4):
            wdocs.append({
                "id": new_id(), "patient_id": pid,
                "date": (start + timedelta(days=wk * 30)).isoformat(),
                "weight": base_w + wk + random.randint(0, 1),
            })
        await db.weight_records.insert_many(wdocs)

        if scn == "keluhan_ringan":
            await db.symptom_reports.insert_one(
                {"id": new_id(), "patient_id": pid, "symptoms": ["mual_muntah"],
                 "severity": "ringan", "started_at": today_str(), "note": "Mual ringan pagi hari",
                 "is_severe": False, "reported_at": iso(now_utc())})
            await create_alert(patient, "efek_samping", "Keluhan: mual ringan", "kuning")
        if scn == "keluhan_berat":
            await db.symptom_reports.insert_one(
                {"id": new_id(), "patient_id": pid, "symptoms": ["mata_kulit_kuning", "sesak_napas"],
                 "severity": "berat", "started_at": today_str(), "note": "Kulit menguning, sesak",
                 "is_severe": True, "reported_at": iso(now_utc())})
            await create_alert(patient, "efek_samping", "Keluhan berat: mata/kulit kuning, sesak napas", "merah")
        if scn == "lapor_tidak_minum":
            await db.unable_reports.insert_one({
                "id": new_id(), "patient_id": pid, "date": today_str(),
                "reason": "Mual atau muntah", "note": "", "reported_at": iso(now_utc())})
            await create_alert(patient, "tidak_minum", "Pasien melapor: Mual atau muntah", "oranye")

        if i == 0:
            seed_msgs.append({
                "id": new_id(), "patient_id": pid, "sender_role": "patient",
                "sender_id": uid, "sender_name": name,
                "text": "Selamat pagi Bu, saya sudah minum obat pagi ini.",
                "created_at": iso(now_utc() - timedelta(hours=3)),
                "read_by_patient": True, "read_by_staff": True,
            })
            seed_msgs.append({
                "id": new_id(), "patient_id": pid, "sender_role": "staff",
                "sender_id": staff_id, "sender_name": "Petugas Rina",
                "text": "Bagus sekali, terima kasih sudah rutin. Tetap semangat ya!",
                "created_at": iso(now_utc() - timedelta(hours=2, minutes=50)),
                "read_by_patient": False, "read_by_staff": True,
            })
        if scn == "keluhan_berat":
            seed_msgs.append({
                "id": new_id(), "patient_id": pid, "sender_role": "patient",
                "sender_id": uid, "sender_name": name,
                "text": "Bu, badan saya terasa sangat lemas dan kulit agak menguning. Apakah saya perlu ke Puskesmas?",
                "created_at": iso(now_utc() - timedelta(minutes=40)),
                "read_by_patient": True, "read_by_staff": False,
            })

    if seed_msgs:
        await db.messages.insert_many(seed_msgs)
    logger.info("Seed complete.")


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
