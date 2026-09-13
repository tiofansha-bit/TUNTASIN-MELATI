import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Card, Icon, Loading, StateView } from "@/src/components/ui";
import { DOSE_STATUS } from "@/src/constants";
import { fmtDate, relativeDays } from "@/src/utils/date";
import dayjs from "dayjs";

type Schedule = {
  days: { date: string; status: string }[];
  med_times: string[];
  next_pickup_date: string;
  next_control_date: string;
  next_sputum_date: string;
  next_weigh_date: string;
  est_end_date: string;
  phase: string;
};

const LEGEND = [
  { key: "taken", label: "Sudah minum" },
  { key: "late", label: "Terlambat" },
  { key: "pending", label: "Belum terkonfirmasi" },
  { key: "reported", label: "Tidak minum" },
  { key: "notyet", label: "Belum waktunya" },
];

export default function Jadwal() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Schedule>({
    queryKey: ["patient-schedule"],
    queryFn: () => api("/patient/schedule"),
  });

  if (isLoading) return <View style={styles.root}><Loading /></View>;
  if (isError || !data)
    return <View style={[styles.root, { paddingTop: insets.top }]}><StateView icon="cloud-offline-outline" title="Gagal memuat jadwal" /></View>;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Jadwal</Text>
        <Text style={styles.headerSub}>Perjalanan pengobatan Anda</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        <Card>
          <Text style={styles.cardTitle}>Kalender minum obat (30 hari)</Text>
          <View style={styles.calGrid}>
            {data.days.map((d) => {
              const st = (DOSE_STATUS as any)[d.status] ?? DOSE_STATUS.notyet;
              const col = (colors as any)[st.token];
              return (
                <View key={d.date} style={[styles.calCell, { backgroundColor: col + "22", borderColor: col }]}>
                  <Text style={[styles.calDay, { color: colors.onSurface }]}>{dayjs(d.date).date()}</Text>
                  <Icon name={st.icon} size={14} color={col} />
                </View>
              );
            })}
          </View>
          <View style={styles.legend}>
            {LEGEND.map((l) => {
              const st = (DOSE_STATUS as any)[l.key];
              const col = (colors as any)[st.token];
              return (
                <View key={l.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: col }]} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Text style={styles.sectionLabel}>Jadwal pelayanan</Text>
        <ApptRow icon="cube-outline" label="Pengambilan obat" date={data.next_pickup_date} />
        <ApptRow icon="clipboard-outline" label="Kontrol" date={data.next_control_date} />
        <ApptRow icon="flask-outline" label="Pemeriksaan dahak" date={data.next_sputum_date} />
        <ApptRow icon="scale-outline" label="Penimbangan berat badan" date={data.next_weigh_date} />

        <Card style={styles.endCard}>
          <Icon name="flag" size={22} color={colors.brandPrimary} />
          <View>
            <Text style={styles.endLabel}>Perkiraan selesai pengobatan</Text>
            <Text style={styles.endValue}>{fmtDate(data.est_end_date, true)}</Text>
          </View>
        </Card>

        <View style={styles.noteBox}>
          <Icon name="information-circle-outline" size={18} color={colors.info} />
          <Text style={styles.noteText}>
            Ingin mengubah jadwal? Hubungi petugas melalui menu Bantuan. Perubahan berlaku setelah dikonfirmasi petugas.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ApptRow({ icon, label, date }: { icon: any; label: string; date: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.apptRow}>
      <View style={styles.apptIcon}>
        <Icon name={icon} size={20} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.apptLabel}>{label}</Text>
        <Text style={styles.apptDate}>{fmtDate(date)}</Text>
      </View>
      <Text style={styles.apptRel}>{relativeDays(date)}</Text>
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surface },
  headerTitle: { fontSize: 26, fontWeight: "700", color: c.onSurface },
  headerSub: { fontSize: 14, color: c.muted, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: c.onSurface, marginBottom: 12 },
  calGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  calCell: { width: 40, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 1 },
  calDay: { fontSize: 12, fontWeight: "600" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 12, color: c.muted },
  sectionLabel: { fontSize: 16, fontWeight: "600", color: c.onSurface, marginTop: 6 },
  apptRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  apptIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  apptLabel: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  apptDate: { fontSize: 13, color: c.muted, marginTop: 1 },
  apptRel: { fontSize: 13, fontWeight: "600", color: c.brandPrimary },
  endCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brandTertiary, borderColor: c.brandSecondary },
  endLabel: { fontSize: 13, color: c.onBrandTertiary },
  endValue: { fontSize: 17, fontWeight: "700", color: c.onBrandTertiary },
  noteBox: { flexDirection: "row", gap: 8, backgroundColor: "#EFF6FF", padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13, color: c.info, lineHeight: 19 },
}));
