import { View, Text, ScrollView, RefreshControl, useWindowDimensions, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Card, Icon, Loading, StateView } from "@/src/components/ui";

type Dash = { metrics: Record<string, number>; staff_name: string };

const METRICS: { key: string; label: string; icon: string; tone: "brand" | "info" | "warning" | "error" | "muted" }[] = [
  { key: "total_active", label: "Pasien aktif", icon: "people", tone: "brand" },
  { key: "took_today", label: "Sudah minum hari ini", icon: "checkmark-circle", tone: "brand" },
  { key: "not_confirmed", label: "Belum konfirmasi", icon: "help-circle", tone: "warning" },
  { key: "late_confirm", label: "Konfirmasi terlambat", icon: "time", tone: "warning" },
  { key: "reported_unable", label: "Lapor tidak minum", icon: "close-circle", tone: "error" },
  { key: "side_effects", label: "Ada efek samping", icon: "medkit", tone: "warning" },
  { key: "red_alerts", label: "Alert merah", icon: "warning", tone: "error" },
  { key: "meds_low", label: "Obat hampir habis", icon: "cube", tone: "warning" },
  { key: "control_overdue", label: "Kontrol terlambat", icon: "clipboard", tone: "error" },
  { key: "sputum_due", label: "Dahak jatuh tempo", icon: "flask", tone: "warning" },
  { key: "near_end", label: "Mendekati selesai", icon: "flag", tone: "info" },
  { key: "at_risk", label: "Risiko putus berobat", icon: "alert", tone: "error" },
];

export default function StaffDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Dash>({
    queryKey: ["staff-dashboard"],
    queryFn: () => api("/staff/dashboard"),
  });
  const { data: reports } = useQuery<any>({ queryKey: ["staff-reports"], queryFn: () => api("/staff/reports") });

  if (isLoading) return <View style={styles.root}><Loading /></View>;
  if (isError || !data)
    return <View style={[styles.root, { paddingTop: insets.top }]}><StateView icon="cloud-offline-outline" title="Gagal memuat dashboard" /></View>;

  const toneColor = (t: string) =>
    t === "brand" ? colors.brandPrimary : t === "info" ? colors.info : t === "warning" ? colors.warning : t === "error" ? colors.error : colors.muted;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.hello}>Dashboard Pemantauan</Text>
          <Text style={styles.staffName}>{data.staff_name} • Puskesmas Melati</Text>
        </View>
        <Pressable style={styles.alertBtn} onPress={() => router.push("/(staff)/alert")} testID="header-alerts">
          <Icon name="notifications" size={22} color={colors.onSurface} />
          {data.metrics.red_alerts > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{data.metrics.red_alerts}</Text></View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        {data.metrics.red_alerts > 0 ? (
          <Pressable onPress={() => router.push("/(staff)/alert")} testID="red-alert-banner">
            <Card style={styles.redBanner}>
              <Icon name="warning" size={26} color={colors.onError} />
              <View style={{ flex: 1 }}>
                <Text style={styles.redTitle}>{data.metrics.red_alerts} alert merah belum ditangani</Text>
                <Text style={styles.redSub}>Perlu tindak lanjut segera</Text>
              </View>
              <Icon name="chevron-forward" size={22} color={colors.onError} />
            </Card>
          </Pressable>
        ) : null}

        <View style={styles.grid}>
          {METRICS.map((m) => (
            <Card key={m.key} style={[styles.metricCard, { width: `${100 / cols - 2}%` }]} testID={`metric-${m.key}`}>
              <View style={[styles.metricIcon, { backgroundColor: toneColor(m.tone) + "1A" }]}>
                <Icon name={m.icon as any} size={20} color={toneColor(m.tone)} />
              </View>
              <Text style={styles.metricValue}>{data.metrics[m.key] ?? 0}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </Card>
          ))}
        </View>

        {reports ? (
          <Card style={styles.reportCard}>
            <Text style={styles.reportTitle}>Ringkasan Laporan</Text>
            <ReportRow label="Rata-rata kepatuhan (30 hari)" value={`${reports.avg_adherence_30}%`} />
            <ReportRow label="Menyelesaikan tahap awal" value={reports.completed_initial_phase} />
            <ReportRow label="Menyelesaikan pengobatan" value={reports.completed_treatment} />
            <ReportRow label="Alert selesai / total" value={`${reports.resolved_alerts}/${reports.total_alerts}`} />
            <Text style={styles.reportSub}>Distribusi per kelurahan</Text>
            {reports.by_kelurahan?.map((k: any) => (
              <ReportRow key={k.kelurahan} label={k.kelurahan} value={`${k.count} pasien`} />
            ))}
            <View style={styles.exportNote}>
              <Icon name="document-outline" size={16} color={colors.muted} />
              <Text style={styles.exportNoteText}>Ekspor PDF / Excel / CSV tersedia pada versi web petugas.</Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ReportRow({ label, value }: { label: string; value: any }) {
  const styles = useStyles();
  return (
    <View style={styles.repRow}>
      <Text style={styles.repLabel}>{label}</Text>
      <Text style={styles.repValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 12 },
  hello: { fontSize: 22, fontWeight: "700", color: c.onSurface },
  staffName: { fontSize: 13, color: c.muted, marginTop: 2 },
  alertBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, backgroundColor: c.error, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: c.onError, fontSize: 10, fontWeight: "700" },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  redBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.error, borderColor: c.error },
  redTitle: { color: c.onError, fontSize: 15, fontWeight: "700" },
  redSub: { color: c.onError, fontSize: 13, opacity: 0.9 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  metricCard: { gap: 6, minHeight: 108 },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 26, fontWeight: "700", color: c.onSurface },
  metricLabel: { fontSize: 12, color: c.muted, lineHeight: 16 },
  reportCard: { gap: 8 },
  reportTitle: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  reportSub: { fontSize: 13, fontWeight: "600", color: c.muted, marginTop: 8 },
  repRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  repLabel: { fontSize: 14, color: c.onSurfaceSecondary, flex: 1 },
  repValue: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  exportNote: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10, backgroundColor: c.surfaceTertiary, padding: 10, borderRadius: 10 },
  exportNoteText: { flex: 1, fontSize: 12, color: c.onSurfaceTertiary },
}));
