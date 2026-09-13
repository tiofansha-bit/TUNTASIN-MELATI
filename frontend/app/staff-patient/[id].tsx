import { useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, useWindowDimensions, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, LineChart } from "react-native-gifted-charts";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Button, Card, Icon, Loading, RiskPill, StateView } from "@/src/components/ui";
import { DOSE_STATUS, SYMPTOM_LABEL, ALERT_STATUS_LABEL } from "@/src/constants";
import { fmtDate, fmtDateShort, fmtTime, relativeDays } from "@/src/utils/date";
import dayjs from "dayjs";

export default function PatientDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 900) - 80;

  const [planOpen, setPlanOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["staff-patient", id],
    queryFn: () => api(`/staff/patients/${id}`),
  });

  if (isLoading) return <View style={styles.root}><Loading /></View>;
  if (isError || !data)
    return <View style={[styles.root, { paddingTop: insets.top }]}><StateView icon="cloud-offline-outline" title="Gagal memuat pasien" /></View>;

  const p = data.profile;
  const call = () => Linking.openURL(`tel:${p.phone}`).catch(() => {});

  const barData = (data.weekly_adherence || []).map((w: any) => ({
    value: w.pct, label: w.label,
    frontColor: w.pct < 60 ? colors.warning : colors.brandPrimary,
  }));
  const lineData = (data.weights || []).map((w: any) => ({ value: w.weight, label: dayjs(w.date).format("MMM") }));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="back-btn"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{p.name}</Text>
        <Pressable onPress={call} hitSlop={12} testID="call-patient"><Icon name="call" size={22} color={colors.brandPrimary} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <Card style={styles.profileCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pName}>{p.name}</Text>
              <Text style={styles.pMeta}>{p.code} • {p.kelurahan} • {p.age_group === "anak" ? "Anak" : "Dewasa"}</Text>
            </View>
            <RiskPill level={p.risk_level} />
          </View>
          <View style={styles.riskReasons}>
            {p.risk_reasons?.map((r: string, i: number) => (
              <Text key={i} style={styles.riskReason}>• {r}</Text>
            ))}
          </View>
          <View style={styles.divider} />
          <InfoGrid p={p} />
        </Card>

        <Button title="Kelola Rencana Pengobatan" icon="create-outline" variant="secondary" onPress={() => setPlanOpen(true)} testID="btn-edit-plan" />

        {/* Adherence calendar */}
        <Card>
          <Text style={styles.cardTitle}>Kalender Kepatuhan (30 hari)</Text>
          <View style={styles.calGrid}>
            {data.calendar.map((d: any) => {
              const st = (DOSE_STATUS as any)[d.status] ?? DOSE_STATUS.pending;
              const col = (colors as any)[st.token];
              return (
                <View key={d.date} style={[styles.calCell, { backgroundColor: col + "22", borderColor: col }]}>
                  <Text style={styles.calDay}>{dayjs(d.date).date()}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Weekly adherence chart */}
        <Card>
          <Text style={styles.cardTitle}>Kepatuhan Mingguan</Text>
          {barData.length ? (
            <BarChart
              data={barData}
              width={chartWidth}
              height={160}
              barWidth={18}
              maxValue={100}
              noOfSections={4}
              spacing={16}
              frontColor={colors.brandPrimary}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
              yAxisThickness={0}
              xAxisThickness={0}
              hideRules={false}
              rulesColor={colors.divider}
            />
          ) : <Text style={styles.empty}>Belum ada data.</Text>}
        </Card>

        {/* Weight chart */}
        <Card>
          <Text style={styles.cardTitle}>Grafik Berat Badan (kg)</Text>
          {lineData.length ? (
            <LineChart
              data={lineData}
              width={chartWidth}
              height={150}
              spacing={Math.max(40, chartWidth / (lineData.length + 1))}
              color={colors.brandPrimary}
              thickness={3}
              dataPointsColor={colors.brandPrimary}
              yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
              yAxisThickness={0}
              xAxisThickness={0}
              rulesColor={colors.divider}
              curved
            />
          ) : <Text style={styles.empty}>Belum ada data.</Text>}
        </Card>

        {/* Symptoms history */}
        <Card>
          <Text style={styles.cardTitle}>Riwayat Keluhan & Efek Samping</Text>
          {data.symptoms?.length ? data.symptoms.map((s: any) => (
            <View key={s.id} style={styles.histRow}>
              <View style={[styles.sevDot, { backgroundColor: s.is_severe ? colors.error : s.severity === "sedang" ? colors.warning : colors.brandPrimary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histTitle}>{s.symptoms.map((x: string) => SYMPTOM_LABEL[x] || x).join(", ")}</Text>
                <Text style={styles.histMeta}>{s.severity} • {fmtDateShort(s.reported_at)} {fmtTime(s.reported_at)}</Text>
              </View>
            </View>
          )) : <Text style={styles.empty}>Tidak ada keluhan.</Text>}
        </Card>

        {/* Alerts */}
        <Card>
          <Text style={styles.cardTitle}>Riwayat Alert & Tindak Lanjut</Text>
          {data.alerts?.length ? data.alerts.map((a: any) => (
            <View key={a.id} style={styles.histRow}>
              <View style={[styles.sevDot, { backgroundColor: a.priority === "merah" ? colors.error : a.priority === "oranye" ? colors.riskOrange : colors.warning }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histTitle}>{a.cause}</Text>
                <Text style={styles.histMeta}>{ALERT_STATUS_LABEL[a.status]} • {fmtDateShort(a.created_at)}</Text>
              </View>
            </View>
          )) : <Text style={styles.empty}>Tidak ada alert.</Text>}
        </Card>

        {/* Dose history */}
        <Card>
          <Text style={styles.cardTitle}>Riwayat Konfirmasi Obat</Text>
          {data.dose_history?.slice(0, 14).map((d: any, i: number) => {
            const st = (DOSE_STATUS as any)[d.status] ?? DOSE_STATUS.pending;
            return (
              <View key={i} style={styles.doseRow}>
                <Text style={styles.doseDate}>{fmtDate(d.date)}</Text>
                <View style={[styles.doseBadge, { backgroundColor: (colors as any)[st.token] + "22" }]}>
                  <Icon name={st.icon} size={13} color={(colors as any)[st.token]} />
                  <Text style={[styles.doseStatus, { color: (colors as any)[st.token] }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Audit trail */}
        <Card>
          <Text style={styles.cardTitle}>Audit Trail</Text>
          {data.audit?.length ? data.audit.slice(0, 12).map((a: any) => (
            <View key={a.id} style={styles.auditRow}>
              <Icon name="ellipse" size={7} color={colors.muted} />
              <Text style={styles.auditText}>{a.action} • {fmtDateShort(a.at)} {fmtTime(a.at)}</Text>
            </View>
          )) : <Text style={styles.empty}>Belum ada perubahan.</Text>}
        </Card>
      </ScrollView>

      <PlanModal
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        patient={p}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["staff-patient", id] });
          qc.invalidateQueries({ queryKey: ["staff-patients"] });
          setPlanOpen(false);
        }}
      />
    </View>
  );
}

function InfoGrid({ p }: { p: any }) {
  const styles = useStyles();
  return (
    <View style={styles.infoGrid}>
      <Info label="Mulai pengobatan" value={fmtDate(p.start_date)} />
      <Info label="Perkiraan selesai" value={fmtDate(p.est_end_date)} />
      <Info label="Tahap" value={p.phase === "awal" ? "Awal" : "Lanjutan"} />
      <Info label="Hari ke" value={`${p.treatment_day}`} />
      <Info label="Patuh 7 hari" value={`${p.adherence_7}%`} />
      <Info label="Patuh 30 hari" value={`${p.adherence_30}%`} />
      <Info label="Kontrol" value={relativeDays(p.next_control_date)} />
      <Info label="Ambil obat" value={relativeDays(p.next_pickup_date)} />
      <Info label="Telepon" value={p.phone} />
      <Info label="Status" value={p.status === "aktif" ? "Aktif" : "Selesai"} />
    </View>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function PlanModal({ visible, onClose, patient, onSaved }: { visible: boolean; onClose: () => void; patient: any; onSaved: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState(patient.phase);
  const [status, setStatus] = useState(patient.status);
  const [control, setControl] = useState(patient.next_control_date || "");
  const [pickup, setPickup] = useState(patient.next_pickup_date || "");
  const [sputum, setSputum] = useState(patient.next_sputum_date || "");
  const [weigh, setWeigh] = useState(patient.next_weigh_date || "");
  const [endDate, setEndDate] = useState(patient.est_end_date || "");

  const mut = useMutation({
    mutationFn: () => api(`/staff/patients/${patient.id}/plan`, {
      method: "PATCH",
      body: {
        phase, treatment_status: status,
        next_control_date: control, next_pickup_date: pickup,
        next_sputum_date: sputum, next_weigh_date: weigh, est_end_date: endDate,
      },
    }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved();
    },
  });

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Rencana Pengobatan</Text>
            <Text style={styles.sheetHint}>Perubahan tercatat dalam audit trail. Dosis tidak dikunci; masukkan sesuai pedoman.</Text>

            <Text style={styles.fieldLabel}>Tahap pengobatan</Text>
            <View style={styles.toggleRow}>
              {["awal", "lanjutan"].map((v) => (
                <Pressable key={v} testID={`plan-phase-${v}`} onPress={() => setPhase(v)} style={[styles.toggle, phase === v && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  <Text style={[styles.toggleText, phase === v && { color: colors.onBrandPrimary }]}>{v === "awal" ? "Tahap Awal" : "Tahap Lanjutan"}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Status pengobatan</Text>
            <View style={styles.toggleRow}>
              {["aktif", "selesai"].map((v) => (
                <Pressable key={v} testID={`plan-status-${v}`} onPress={() => setStatus(v)} style={[styles.toggle, status === v && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  <Text style={[styles.toggleText, status === v && { color: colors.onBrandPrimary }]}>{v === "aktif" ? "Aktif" : "Selesai"}</Text>
                </Pressable>
              ))}
            </View>

            <DateField label="Jadwal kontrol" value={control} onChange={setControl} testID="plan-control" />
            <DateField label="Pengambilan obat" value={pickup} onChange={setPickup} testID="plan-pickup" />
            <DateField label="Pemeriksaan dahak" value={sputum} onChange={setSputum} testID="plan-sputum" />
            <DateField label="Penimbangan berat" value={weigh} onChange={setWeigh} testID="plan-weigh" />
            <DateField label="Perkiraan selesai" value={endDate} onChange={setEndDate} testID="plan-end" />

            <View style={styles.warnBox}>
              <Icon name="information-circle-outline" size={16} color={colors.info} />
              <Text style={styles.warnText}>Perubahan berat badan tidak otomatis mengubah dosis — hanya membuat pengingat untuk ditinjau petugas.</Text>
            </View>

            <Button title="Simpan Rencana" onPress={() => mut.mutate()} loading={mut.isPending} testID="btn-save-plan" style={{ marginTop: 12 }} />
            <Button title="Batal" variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DateField({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <>
      <Text style={styles.fieldLabel}>{label} (YYYY-MM-DD)</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder="2026-01-31"
        placeholderTextColor={colors.muted}
        style={styles.dateInput}
        autoCapitalize="none"
      />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: c.onSurface },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  profileCard: { gap: 10 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pName: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  pMeta: { fontSize: 13, color: c.muted, marginTop: 2 },
  riskReasons: { gap: 2 },
  riskReason: { fontSize: 13, color: c.onSurfaceSecondary },
  divider: { height: 1, backgroundColor: c.divider, marginVertical: 4 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap" },
  infoItem: { width: "50%", paddingVertical: 6 },
  infoLabel: { fontSize: 12, color: c.muted },
  infoValue: { fontSize: 15, fontWeight: "600", color: c.onSurface, marginTop: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: 12 },
  calGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  calCell: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  calDay: { fontSize: 12, fontWeight: "600", color: c.onSurface },
  empty: { fontSize: 14, color: c.muted, paddingVertical: 8 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  sevDot: { width: 10, height: 10, borderRadius: 999 },
  histTitle: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  histMeta: { fontSize: 12, color: c.muted, marginTop: 1 },
  doseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  doseDate: { fontSize: 14, color: c.onSurfaceSecondary },
  doseBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  doseStatus: { fontSize: 12, fontWeight: "600" },
  auditRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  auditText: { fontSize: 13, color: c.onSurfaceSecondary },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "88%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 999, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  sheetHint: { fontSize: 13, color: c.muted, marginTop: 4, marginBottom: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginTop: 14, marginBottom: 6 },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggle: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center" },
  toggleText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary },
  dateInput: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, color: c.onSurface },
  warnBox: { flexDirection: "row", gap: 8, backgroundColor: "#EFF6FF", padding: 12, borderRadius: 12, marginTop: 14 },
  warnText: { flex: 1, fontSize: 13, color: c.info, lineHeight: 19 },
}));
