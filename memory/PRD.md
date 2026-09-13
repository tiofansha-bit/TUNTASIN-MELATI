# Melati TUNTASin — PRD

## Problem statement
Mobile-first app for tuberculosis (TB) medication adherence monitoring in the working area of Puskesmas Melati. Two user types only: **Pasien** (patient) and **Petugas TB** (staff). Goal: remind patients daily, let them confirm intake in ≤2 steps, report symptoms in ≤3 steps, detect late/irregular patients, and help staff quickly find & follow up problem patients — reducing treatment dropout. The app never makes clinical decisions and never tells patients to change/stop medication.

## Architecture
- **Frontend**: Expo Router (React Native), TanStack Query, react-native-keyboard-controller, @gorhom/bottom-sheet, react-native-gifted-charts, Ionicons. Theme tokens in `src/theme.ts` (jasmine green / turquoise, red reserved for urgent).
- **Backend**: FastAPI (`/api` prefix) + MongoDB (motor, async). UUID string IDs. JWT bearer auth (username + bcrypt PIN), RBAC (patient sees own data, staff sees assigned patients).
- **Routing**: `app/login.tsx`, `app/(patient)/*` (4 tabs), `app/(staff)/*` (4 tabs), full-screen `app/lapor-*` and `app/staff-patient/[id]`.

## User personas
1. **Pasien TB** — low digital literacy; needs huge buttons, short friendly non-stigmatizing text; only confirms intake, reports "can't take", reports symptoms, views schedule/help.
2. **Petugas TB** — needs a fast monitoring dashboard, prioritized patient list, alert triage, and treatment-plan editing.

## Core requirements (static)
- Patient confirm intake ≤2 steps; report symptom ≤3 steps.
- Severe symptoms → RED alert on staff dashboard.
- App never auto-changes dose; weight change only prompts staff review.
- All clinical data changes recorded in audit trail.
- Colors + icons + text labels for adherence calendar (not color-only).
- Configurable risk thresholds (staff-owned), not hardcoded doses.

## Implemented (2026-06)
- **Auth**: username+PIN login, JWT, `/auth/me`, change-PIN, logout-all (token_version), RBAC 403s. (verified)
- **Patient**: Hari Ini (greeting, hari ke-N, phase, progress bar, today's meds, motivation, next services), SUDAH MINUM 2-step confirm with double-log prevention (409) + late-confirmation logic, BELUM BISA MINUM (reason grid → oranye alert + safety message + Hubungi Petugas), ADA KELUHAN (symptom multi-select → severity → note; severe → merah alert + red safety screen with contact/location/emergency), Jadwal (30-day color calendar + legend + appointments + est end), Bantuan (chat/call/emergency + clinic info + FAQ + edukasi), Profil (info, change PIN, logout, privacy note).
- **Staff**: Dashboard (13 metric cards + red-alert banner + reports summary + kelurahan distribution), Daftar Prioritas Pasien (risk-sorted cards, filters risk/phase/kelurahan + search), Patient detail (profile+risk reasons, adherence calendar, weekly adherence bar chart, weight line chart, symptom/alert/dose history, audit trail, Kelola Rencana Pengobatan modal → PATCH plan + audit), Alert management (status filters, action sheet with status changes, quick actions, notes, mark selesai), Profil.
- **Demo data**: 22 simulated patients across all scenarios + 2 demo accounts.
- **Testing**: 24/24 backend pytest pass; frontend flows verified.

## Implemented (2026-09)
- **Staff patient management**: Add / Edit profile / Soft-delete.
  - Add: `POST /api/staff/patients` (staff-only) — minimal fields name, username, initial PIN, phone, kelurahan; role hardcoded patient, bcrypt PIN (reuses `hash_pin`), username lowercased + regex-validated + unique (409), auto code `TB-YYYYnnn`, sensible defaults (start today, phase awal, dewasa, med_times, aktif, `deleted_at:None`). Entry: "+ Tambah" on Daftar Pasien → `app/tambah-pasien.tsx` (KeyboardAwareScrollView form).
  - Edit profile: `PATCH /api/staff/patients/{id}/profile` — name, phone, address, kelurahan, age_group (dewasa/anak), status (aktif/selesai); name/phone propagate to linked user; audit. UI: "Edit Profil" bottom sheet on Patient Detail.
  - Soft-delete: `DELETE /api/staff/patients/{id}` — sets `patients.deleted_at`, disables user login + bumps `token_version` (kills active session). Data retained/recoverable. All staff queries (patients/dashboard/reports/conversations/unread/detail/thread/plan) filter `deleted_at:None`; startup migration backfills existing docs. UI: "Hapus" → confirm sheet on Patient Detail.
  - RBAC verified (patient→403, no token→401, unknown id→404). Tested: 19/19 backend + frontend flows pass.
- **Chat Pasien–Petugas (in-app)**: one thread per patient. Backend `messages` collection + endpoints — patient: GET/POST `/api/patient/messages`, GET `/api/patient/messages/unread`; staff: GET `/api/staff/conversations` (unread-first, then newest), GET/POST `/api/staff/patients/{id}/messages`, GET `/api/staff/messages/unread`. Read-receipts on thread open. RBAC + assignment enforced (403/404). Entry points: patient Bantuan "Chat Petugas" card (with unread badge) → `app/chat-pasien.tsx`; staff Dashboard header chat button (with unread badge) → `app/chat-daftar.tsx` (conversation list) → `app/chat-percakapan.tsx`. Reusable `src/components/chat.tsx` (KeyboardAvoidingView translate-with-padding, inverted list). Send/receive + pull/tap refresh, service-hours info banner (no quick-reply templates, per user choice). Tested: 11/11 backend + frontend flows pass.

## Prioritized backlog
- **P1**: fallback WhatsApp/SMS reminder config, extra-large font accessibility mode, offline queue + "Tersimpan, menunggu sinkronisasi".
- **P1**: Report export (PDF/Excel/CSV) on staff web; home-visit records; consent capture screen.
- **P2**: In-app scheduled reminders / push notifications (needs native build), edukasi audio TTS, configurable alert-threshold UI, sputum results entry.

## Features needing validation before real patient use
- Clinical accuracy of risk thresholds & alert triggers (needs medical validation).
- Legal/privacy compliance with Indonesian data-protection regulation (UU PDP), consent flow, data retention & backup.
- Security hardening: PIN lockout/rate-limit, encryption at rest/in transit review.

## Next tasks
1. Chat pasien–petugas with quick templates + service-hours behaviour.
2. Offline-first for Hari Ini + sync queue.
3. Report export + home-visit logging.
