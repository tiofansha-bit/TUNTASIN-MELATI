import { useState } from "react";
import { View, Text, ScrollView, Modal, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Button, Card, Icon, Loading, ProgressBar, StateView } from "@/src/components/ui";
import { fmtDate, relativeDays } from "@/src/utils/date";

type Today = {
  first_name: string;
  treatment_day: number;
  total_days: number;
  progress_pct: number;
  phase: string;
  med_times: string[];
  med_name: string;
  today_status: string;
  today_confirmed_at: string | null;
  today_unable_reason: string | null;
  adherence_30: { pct: number };
  next_pickup_date: string;
  next_control_date: string;
  next_sputum_date: string;
  next_weigh_date: string;
  motivation: string;
};

export default function HariIni() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<Today>({
    queryKey: ["patient-today"],
    queryFn: () => api("/patient/today"),
  });

  const confirmMut = useMutation({
    mutationFn: () => api("/patient/dose-confirm", { method: "POST", body: {} }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirmVisible(false);
      setSuccessVisible(true);
      qc.invalidateQueries({ queryKey: ["patient-today"] });
      qc.invalidateQueries({ queryKey: ["patient-schedule"] });
    },
    onError: () => setConfirmVisible(false),
  });

  if (isLoading) return <View style={styles.root}><Loading testID="today-loading" /></View>;
  if (isError || !data)
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StateView
          testID="today-error"
          icon="cloud-offline-outline"
          title="Gagal memuat"
          subtitle="Periksa koneksi internet Anda."
          action={<Button title="Muat Ulang" onPress={() => refetch()} variant="secondary" />}
        />
      </View>
    );

  const taken = data.today_status === "taken" || data.today_status === "late";
  const reported = data.today_status === "reported";

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
      >
        <Text style={styles.greeting} testID="today-greeting">Halo, {data.first_name} 👋</Text>
        <Text style={styles.subGreeting}>Semoga hari Anda menyenangkan</Text>

        <Card style={styles.progressCard}>
          <View style={styles.dayRow}>
            <View>
              <Text style={styles.dayBig} testID="today-treatment-day">Hari ke-{data.treatment_day}</Text>
              <Text style={styles.phaseText}>
                Tahap {data.phase === "awal" ? "Awal" : "Lanjutan"} • {data.progress_pct}% perjalanan
              </Text>
            </View>
            <View style={styles.adhBadge}>
              <Text style={styles.adhPct}>{data.adherence_30.pct}%</Text>
              <Text style={styles.adhLabel}>patuh</Text>
            </View>
          </View>
          <ProgressBar pct={data.progress_pct} height={14} />
          <Text style={styles.progressHint}>
            Dari total {data.total_days} hari pengobatan
          </Text>
        </Card>

        <Card style={styles.scheduleCard}>
          <View style={styles.rowBetween}>
            <View style={styles.iconRow}>
              <Icon name="medkit" size={22} color={colors.brandPrimary} />
              <Text style={styles.scheduleTitle}>Obat hari ini</Text>
            </View>
            {taken ? (
              <View style={styles.doneChip}>
                <Icon name="checkmark-circle" size={16} color={colors.onSuccess} />
                <Text style={styles.doneChipText}>Sudah diminum</Text>
              </View>
            ) : reported ? (
              <View style={[styles.doneChip, { backgroundColor: colors.warning }]}>
                <Text style={styles.doneChipText}>Dilaporkan</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.medName}>{data.med_name}</Text>
          <View style={styles.timeRow}>
            {data.med_times.map((t) => (
              <View key={t} style={styles.timeChip}>
                <Icon name="alarm-outline" size={15} color={colors.onBrandTertiary} />
                <Text style={styles.timeChipText}>{t} WIB</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.motivCard}>
          <Icon name="heart" size={20} color={colors.brandPrimary} />
          <Text style={styles.motivText}>{data.motivation}</Text>
        </Card>

        <Text style={styles.sectionLabel}>Pelayanan berikutnya</Text>
        <View style={styles.serviceGrid}>
          <ServiceItem icon="cube-outline" label="Ambil obat" value={relativeDays(data.next_pickup_date)} date={fmtDate(data.next_pickup_date)} />
          <ServiceItem icon="clipboard-outline" label="Kontrol" value={relativeDays(data.next_control_date)} date={fmtDate(data.next_control_date)} />
          <ServiceItem icon="flask-outline" label="Periksa dahak" value={relativeDays(data.next_sputum_date)} date={fmtDate(data.next_sputum_date)} />
          <ServiceItem icon="scale-outline" label="Timbang berat" value={relativeDays(data.next_weigh_date)} date={fmtDate(data.next_weigh_date)} />
        </View>
      </ScrollView>

      {/* Sticky bottom actions */}
      <View style={[styles.actionBar, { paddingBottom: 12 }]}>
        {!taken && !reported ? (
          <Button
            title="SUDAH MINUM"
            icon="checkmark-circle"
            size="xl"
            onPress={() => setConfirmVisible(true)}
            testID="btn-sudah-minum"
          />
        ) : (
          <View style={styles.takenBanner} testID="today-taken-banner">
            <Icon name="checkmark-done-circle" size={26} color={colors.success} />
            <Text style={styles.takenBannerText}>
              {taken ? "Terima kasih, obat hari ini sudah tercatat." : "Petugas akan menindaklanjuti laporan Anda."}
            </Text>
          </View>
        )}
        <View style={styles.secondaryRow}>
          <Button
            title="Belum bisa minum"
            variant="outline"
            size="md"
            onPress={() => router.push("/lapor-tidak-minum")}
            testID="btn-belum-minum"
            style={{ flex: 1 }}
          />
          <Button
            title="Ada keluhan"
            variant="secondary"
            size="md"
            icon="medkit-outline"
            onPress={() => router.push("/lapor-keluhan")}
            testID="btn-ada-keluhan"
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* Confirm modal */}
      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Icon name="help-circle" size={44} color={colors.brandPrimary} />
            <Text style={styles.dialogTitle}>Apakah obat sudah benar-benar diminum?</Text>
            <Text style={styles.dialogSub}>Konfirmasi kejujuran Anda membantu kesembuhan.</Text>
            <Button
              title="Ya, sudah"
              size="lg"
              loading={confirmMut.isPending}
              onPress={() => confirmMut.mutate()}
              testID="btn-confirm-yes"
            />
            <Button title="Belum" variant="ghost" onPress={() => setConfirmVisible(false)} testID="btn-confirm-no" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Success modal */}
      <Modal transparent visible={successVisible} animationType="fade" onRequestClose={() => setSuccessVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSuccessVisible(false)}>
          <View style={styles.dialog}>
            <View style={styles.successCircle}>
              <Icon name="checkmark" size={44} color={colors.onSuccess} />
            </View>
            <Text style={styles.dialogTitle}>Terima kasih!</Text>
            <Text style={styles.dialogSub}>Satu langkah lagi menuju sembuh.</Text>
            <Button title="Tutup" size="lg" onPress={() => setSuccessVisible(false)} testID="btn-success-close" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ServiceItem({ icon, label, value, date }: { icon: any; label: string; value: string; date: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Card style={styles.serviceItem}>
      <Icon name={icon} size={22} color={colors.brandPrimary} />
      <Text style={styles.serviceLabel}>{label}</Text>
      <Text style={styles.serviceValue}>{value}</Text>
      <Text style={styles.serviceDate}>{date}</Text>
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 16, gap: 12 },
  greeting: { fontSize: 26, fontWeight: "700", color: c.onSurface },
  subGreeting: { fontSize: 15, color: c.muted, marginBottom: 4 },
  progressCard: { gap: 12 },
  dayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayBig: { fontSize: 24, fontWeight: "700", color: c.onSurface },
  phaseText: { fontSize: 14, color: c.muted, marginTop: 2 },
  adhBadge: { backgroundColor: c.brandTertiary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" },
  adhPct: { fontSize: 20, fontWeight: "700", color: c.onBrandTertiary },
  adhLabel: { fontSize: 11, color: c.onBrandTertiary },
  progressHint: { fontSize: 13, color: c.muted },
  scheduleCard: { gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scheduleTitle: { fontSize: 18, fontWeight: "600", color: c.onSurface },
  medName: { fontSize: 15, color: c.onSurfaceSecondary },
  timeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  timeChipText: { color: c.onBrandTertiary, fontSize: 14, fontWeight: "600" },
  doneChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.success, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  doneChipText: { color: c.onSuccess, fontSize: 12, fontWeight: "600" },
  motivCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brandTertiary, borderColor: c.brandSecondary },
  motivText: { flex: 1, fontSize: 15, color: c.onBrandTertiary, lineHeight: 21, fontWeight: "500" },
  sectionLabel: { fontSize: 16, fontWeight: "600", color: c.onSurface, marginTop: 4 },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  serviceItem: { width: "47%", flexGrow: 1, gap: 4 },
  serviceLabel: { fontSize: 13, color: c.muted, marginTop: 4 },
  serviceValue: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  serviceDate: { fontSize: 12, color: c.muted },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  secondaryRow: { flexDirection: "row", gap: 10 },
  takenBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.brandTertiary, borderRadius: 16, padding: 16 },
  takenBannerText: { flex: 1, color: c.onBrandTertiary, fontSize: 15, fontWeight: "500" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 420, backgroundColor: c.surfaceSecondary, borderRadius: 24, padding: 24, alignItems: "center", gap: 12 },
  dialogTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  dialogSub: { fontSize: 14, color: c.muted, textAlign: "center", marginBottom: 8 },
  successCircle: { width: 76, height: 76, borderRadius: 999, backgroundColor: c.success, alignItems: "center", justifyContent: "center" },
}));
