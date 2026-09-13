// Shared domain labels & option lists (Bahasa Indonesia).

export const UNABLE_REASONS = [
  { key: "Lupa", label: "Lupa", icon: "alarm-outline" },
  { key: "Obat habis", label: "Obat habis", icon: "cube-outline" },
  { key: "Mual atau muntah", label: "Mual atau muntah", icon: "sad-outline" },
  { key: "Ada keluhan", label: "Ada keluhan", icon: "medkit-outline" },
  { key: "Sedang bepergian", label: "Sedang bepergian", icon: "airplane-outline" },
  { key: "Kesulitan membuka aplikasi", label: "Sulit buka aplikasi", icon: "phone-portrait-outline" },
  { key: "Alasan lain", label: "Alasan lain", icon: "ellipsis-horizontal" },
];

// key must match backend SEVERE_SYMPTOMS for severe ones.
export const SYMPTOMS = [
  { key: "mual_muntah", label: "Mual, muntah, nyeri perut", severe: false },
  { key: "tidak_nafsu_makan", label: "Tidak nafsu makan", severe: false },
  { key: "nyeri_sendi", label: "Nyeri sendi", severe: false },
  { key: "kesemutan", label: "Kesemutan / kebas", severe: false },
  { key: "mengantuk", label: "Mengantuk", severe: false },
  { key: "urine_kemerahan", label: "Urine berwarna kemerahan", severe: false },
  { key: "demam", label: "Demam / menggigil", severe: false },
  { key: "ruam_ringan", label: "Ruam kulit", severe: false },
  { key: "mata_kulit_kuning", label: "Mata / kulit menjadi kuning", severe: true },
  { key: "gangguan_penglihatan", label: "Gangguan penglihatan", severe: true },
  { key: "gangguan_pendengaran", label: "Gangguan pendengaran", severe: true },
  { key: "pusing_berputar", label: "Pusing berputar", severe: false },
  { key: "penurunan_kesadaran", label: "Bingung / penurunan kesadaran", severe: true },
  { key: "urine_sangat_berkurang", label: "Urine sangat berkurang", severe: true },
  { key: "sesak_napas", label: "Sesak napas / pingsan", severe: true },
  { key: "ruam_berat", label: "Ruam berat", severe: true },
  { key: "keluhan_lain", label: "Keluhan lain", severe: false },
];

export const SYMPTOM_LABEL: Record<string, string> = SYMPTOMS.reduce(
  (a, s) => ({ ...a, [s.key]: s.label }),
  {},
);

export const RISK_LABEL: Record<string, string> = {
  hijau: "Aman",
  kuning: "Perhatian",
  oranye: "Waspada",
  merah: "Mendesak",
};

export const DOSE_STATUS = {
  taken: { label: "Sudah minum", icon: "checkmark-circle", token: "doseTaken" },
  late: { label: "Terlambat", icon: "time", token: "doseLate" },
  reported: { label: "Lapor tidak minum", icon: "close-circle", token: "doseMissed" },
  pending: { label: "Belum terkonfirmasi", icon: "help-circle", token: "doseUnconfirmed" },
  notyet: { label: "Belum waktunya", icon: "ellipse-outline", token: "doseNotYet" },
} as const;

export const ALERT_STATUS = [
  "baru",
  "sedang_ditindaklanjuti",
  "menunggu_pasien",
  "perlu_kunjungan",
  "perlu_ke_puskesmas",
  "selesai",
];

export const ALERT_STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  sedang_ditindaklanjuti: "Ditindaklanjuti",
  menunggu_pasien: "Menunggu pasien",
  perlu_kunjungan: "Perlu kunjungan rumah",
  perlu_ke_puskesmas: "Perlu ke Puskesmas",
  selesai: "Selesai",
  "-": "—",
};
