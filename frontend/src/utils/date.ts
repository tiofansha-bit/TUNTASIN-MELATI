import dayjs from "dayjs";
import "dayjs/locale/id";

dayjs.locale("id");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function fmtDate(iso?: string | null, full = false): string {
  if (!iso) return "-";
  const d = dayjs(iso);
  if (!d.isValid()) return "-";
  const m = full ? MONTHS_FULL[d.month()] : MONTHS[d.month()];
  return `${d.date()} ${m} ${d.year()}`;
}

export function fmtDateShort(iso?: string | null): string {
  if (!iso) return "-";
  const d = dayjs(iso);
  if (!d.isValid()) return "-";
  return `${d.date()} ${MONTHS[d.month()]}`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "-";
  const d = dayjs(iso);
  if (!d.isValid()) return "-";
  return d.format("HH:mm");
}

export function relativeDays(iso?: string | null): string {
  if (!iso) return "-";
  const diff = dayjs(iso).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  if (diff > 0) return `${diff} hari lagi`;
  return `${Math.abs(diff)} hari lalu`;
}
