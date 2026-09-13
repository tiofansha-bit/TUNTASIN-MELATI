import { useState, useMemo } from "react";
import { View, Text, FlatList, ScrollView, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Card, Icon, Loading, RiskPill, StateView } from "@/src/components/ui";
import { SYMPTOM_LABEL, ALERT_STATUS_LABEL } from "@/src/constants";
import { fmtDateShort, relativeDays } from "@/src/utils/date";

const RISK_CHIPS = [
  { key: "", label: "Semua" },
  { key: "merah", label: "Mendesak" },
  { key: "oranye", label: "Waspada" },
  { key: "kuning", label: "Perhatian" },
  { key: "hijau", label: "Aman" },
];
const PHASE_CHIPS = [
  { key: "", label: "Semua tahap" },
  { key: "awal", label: "Tahap awal" },
  { key: "lanjutan", label: "Tahap lanjutan" },
];

export default function Pasien() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [risk, setRisk] = useState("");
  const [phase, setPhase] = useState("");
  const [kel, setKel] = useState("");
  const [search, setSearch] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (risk) p.set("risk", risk);
    if (phase) p.set("phase", phase);
    if (kel) p.set("kelurahan", kel);
    if (search) p.set("search", search);
    return p.toString();
  }, [risk, phase, kel, search]);

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["staff-patients", params],
    queryFn: () => api(`/staff/patients${params ? `?${params}` : ""}`),
  });

  const kelChips = useMemo(
    () => [{ key: "", label: "Semua kelurahan" }, ...((data?.kelurahans ?? []).map((k: string) => ({ key: k, label: k })))],
    [data?.kelurahans],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Daftar Prioritas Pasien</Text>
        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            testID="patient-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama atau kode pasien"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>
        <ChipRow items={RISK_CHIPS} value={risk} onChange={setRisk} testPrefix="risk" />
        <ChipRow items={PHASE_CHIPS} value={phase} onChange={setPhase} testPrefix="phase" />
        <ChipRow items={kelChips} value={kel} onChange={setKel} testPrefix="kel" />
      </View>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <StateView icon="cloud-offline-outline" title="Gagal memuat daftar pasien" />
      ) : (
        <FlatList
          data={data.patients}
          keyExtractor={(p: any) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={<StateView icon="people-outline" title="Tidak ada pasien" subtitle="Coba ubah filter." />}
          renderItem={({ item }) => <PatientCard p={item} onPress={() => router.push(`/staff-patient/${item.id}`)} />}
        />
      )}
    </View>
  );
}

function ChipRow({ items, value, onChange, testPrefix }: { items: any[]; value: string; onChange: (v: string) => void; testPrefix: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {items.map((it) => {
        const on = value === it.key;
        return (
          <Pressable
            key={it.key || "all"}
            testID={`${testPrefix}-chip-${it.key || "all"}`}
            onPress={() => onChange(it.key)}
            style={[styles.chip, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
          >
            <Text style={[styles.chipText, on && { color: colors.onBrandPrimary }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PatientCard({ p, onPress }: { p: any; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const sym = p.last_symptom ? p.last_symptom.map((s: string) => SYMPTOM_LABEL[s] || s).join(", ") : null;
  return (
    <Card style={styles.pCard} testID={`patient-card-${p.code}`}>
      <View style={styles.pTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pName}>{p.name}</Text>
          <Text style={styles.pMeta}>
            {p.code} • {p.kelurahan} • {p.age_group === "anak" ? "Anak" : "Dewasa"}
          </Text>
        </View>
        <RiskPill level={p.risk_level} testID={`risk-${p.code}`} />
      </View>

      <View style={styles.pStats}>
        <Stat label="Hari" value={`ke-${p.treatment_day}`} />
        <Stat label="Patuh 7h" value={`${p.adherence_7}%`} tone={p.adherence_7 < 60 ? "warn" : "ok"} />
        <Stat label="Patuh 30h" value={`${p.adherence_30}%`} tone={p.adherence_30 < 60 ? "warn" : "ok"} />
        <Stat label="Blm konfirmasi" value={p.unconfirmed} tone={p.unconfirmed > 0 ? "warn" : "ok"} />
      </View>

      <View style={styles.pInfoRow}>
        <Icon name="checkmark-done-outline" size={15} color={colors.muted} />
        <Text style={styles.pInfoText}>
          Konfirmasi terakhir: {p.last_confirmation ? fmtDateShort(p.last_confirmation) : "-"}
        </Text>
      </View>
      {sym ? (
        <View style={styles.pInfoRow}>
          <Icon name="medkit-outline" size={15} color={colors.warning} />
          <Text style={[styles.pInfoText, { color: colors.warning }]} numberOfLines={1}>Keluhan: {sym}</Text>
        </View>
      ) : null}
      <View style={styles.pInfoRow}>
        <Icon name="cube-outline" size={15} color={colors.muted} />
        <Text style={styles.pInfoText}>Ambil obat: {relativeDays(p.next_pickup_date)}</Text>
      </View>

      <View style={styles.pBottom}>
        <View style={styles.fuChip}>
          <Text style={styles.fuText}>Tindak lanjut: {ALERT_STATUS_LABEL[p.follow_up_status] || p.follow_up_status}</Text>
        </View>
        <Pressable style={styles.followBtn} onPress={onPress} testID={`follow-${p.code}`}>
          <Text style={styles.followBtnText}>Tindak Lanjuti</Text>
          <Icon name="arrow-forward" size={16} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: "ok" | "warn" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === "warn" && { color: colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, height: "100%" },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  pCard: { gap: 10 },
  pTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pName: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  pMeta: { fontSize: 13, color: c.muted, marginTop: 2 },
  pStats: { flexDirection: "row", justifyContent: "space-between", backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  statLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
  pInfoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pInfoText: { fontSize: 13, color: c.onSurfaceSecondary, flex: 1 },
  pBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  fuChip: { flex: 1 },
  fuText: { fontSize: 12, color: c.muted },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  followBtnText: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "700" },
}));
