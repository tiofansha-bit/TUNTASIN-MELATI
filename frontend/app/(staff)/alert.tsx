import { useState } from "react";
import { View, Text, FlatList, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Button, Card, Icon, Loading, StateView } from "@/src/components/ui";
import { ALERT_STATUS, ALERT_STATUS_LABEL } from "@/src/constants";
import { fmtDateShort, fmtTime } from "@/src/utils/date";

const FILTERS = [
  { key: "", label: "Semua" },
  { key: "baru", label: "Baru" },
  { key: "sedang_ditindaklanjuti", label: "Ditindaklanjuti" },
  { key: "selesai", label: "Selesai" },
];

const QUICK = [
  { type: "telepon", label: "Telepon", icon: "call" },
  { type: "pesan", label: "Kirim pesan", icon: "chatbubble" },
  { type: "jadwal_kontrol", label: "Jadwalkan kontrol", icon: "clipboard" },
  { type: "kunjungan", label: "Kunjungan rumah", icon: "home" },
  { type: "edukasi", label: "Catat edukasi", icon: "book" },
];

export default function Alerts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<any | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["staff-alerts", filter],
    queryFn: () => api(`/staff/alerts${filter ? `?status=${filter}` : ""}`),
  });

  const mut = useMutation({
    mutationFn: (body: any) => api(`/staff/alerts/${active.id}/action`, { method: "POST", body }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["staff-alerts"] });
      qc.invalidateQueries({ queryKey: ["staff-dashboard"] });
      qc.invalidateQueries({ queryKey: ["staff-patients"] });
    },
  });

  const priColor = (p: string) => (p === "merah" ? colors.error : p === "oranye" ? colors.riskOrange : colors.warning);

  const doAction = (body: any) => {
    mut.mutate(body, {
      onSuccess: () => {
        if (body.status === "selesai") setActive(null);
        setNote("");
      },
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Manajemen Alert</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key || "all"}
                testID={`alert-filter-${f.key || "all"}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
              >
                <Text style={[styles.chipText, on && { color: colors.onBrandPrimary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <StateView icon="cloud-offline-outline" title="Gagal memuat alert" />
      ) : (
        <FlatList
          data={data.alerts}
          keyExtractor={(a: any) => a.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={<StateView icon="checkmark-done-circle-outline" title="Tidak ada alert" subtitle="Semua terkendali." />}
          renderItem={({ item }) => (
            <Card style={styles.aCard} onPress={() => setActive(item)} testID={`alert-${item.id}`}>
              <View style={styles.aTop}>
                <View style={[styles.priDot, { backgroundColor: priColor(item.priority) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.aName}>{item.patient_name}</Text>
                  <Text style={styles.aMeta}>{item.patient_code} • {item.kelurahan}</Text>
                </View>
                <View style={[styles.statusChip, item.status === "selesai" && { backgroundColor: colors.brandTertiary }]}>
                  <Text style={styles.statusText}>{ALERT_STATUS_LABEL[item.status] || item.status}</Text>
                </View>
              </View>
              <Text style={styles.aCause}>{item.cause}</Text>
              <View style={styles.aFooter}>
                <Text style={styles.aTime}>{fmtDateShort(item.created_at)} {fmtTime(item.created_at)}</Text>
                <Text style={[styles.aPri, { color: priColor(item.priority) }]}>
                  {item.priority === "merah" ? "MENDESAK" : item.priority === "oranye" ? "WASPADA" : "PERHATIAN"}
                </Text>
              </View>
            </Card>
          )}
        />
      )}

      <Modal transparent visible={!!active} animationType="slide" onRequestClose={() => setActive(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setActive(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {active ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>{active.patient_name}</Text>
                <Text style={styles.sheetCause}>{active.cause}</Text>

                <Text style={styles.sheetLabel}>Ubah status</Text>
                <View style={styles.statusGrid}>
                  {ALERT_STATUS.map((s) => {
                    const on = active.status === s;
                    return (
                      <Pressable
                        key={s}
                        testID={`set-status-${s}`}
                        style={[styles.statusOpt, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
                        onPress={() => doAction({ status: s })}
                      >
                        <Text style={[styles.statusOptText, on && { color: colors.onBrandPrimary }]}>{ALERT_STATUS_LABEL[s]}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sheetLabel}>Tindakan cepat</Text>
                <View style={styles.quickGrid}>
                  {QUICK.map((q) => (
                    <Pressable key={q.type} testID={`quick-${q.type}`} style={styles.quickBtn} onPress={() => doAction({ action_type: q.type, note: `Petugas melakukan: ${q.label}` })}>
                      <Icon name={q.icon as any} size={20} color={colors.brandPrimary} />
                      <Text style={styles.quickText}>{q.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sheetLabel}>Catatan tindakan</Text>
                <TextInput
                  testID="alert-note"
                  value={note} onChangeText={setNote}
                  placeholder="Tulis catatan..." placeholderTextColor={colors.muted}
                  multiline style={styles.noteInput}
                />
                <Button title="Simpan Catatan" variant="secondary" onPress={() => note.trim() && doAction({ note })} testID="btn-save-note" />

                {active.actions?.length ? (
                  <View style={styles.history}>
                    <Text style={styles.sheetLabel}>Riwayat tindakan</Text>
                    {active.actions.map((a: any, i: number) => (
                      <View key={i} style={styles.histItem}>
                        <Icon name="ellipse" size={8} color={colors.brandPrimary} />
                        <Text style={styles.histText}>{a.note || a.type} — {fmtDateShort(a.at)} {fmtTime(a.at)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Button title="Tandai Selesai" onPress={() => doAction({ status: "selesai" })} loading={mut.isPending} testID="btn-resolve" style={{ marginTop: 12 }} />
                <Button title="Tutup" variant="ghost" onPress={() => setActive(null)} />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  aCard: { gap: 8 },
  aTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  priDot: { width: 12, height: 12, borderRadius: 999 },
  aName: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  aMeta: { fontSize: 12, color: c.muted },
  statusChip: { backgroundColor: c.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: "600", color: c.onSurfaceTertiary },
  aCause: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  aFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  aTime: { fontSize: 12, color: c.muted },
  aPri: { fontSize: 11, fontWeight: "700" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 999, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  sheetCause: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 4, marginBottom: 8 },
  sheetLabel: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginTop: 16, marginBottom: 8 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusOpt: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  statusOptText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  quickText: { fontSize: 13, fontWeight: "600", color: c.onSurface },
  noteInput: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, minHeight: 70, fontSize: 14, color: c.onSurface, textAlignVertical: "top", marginBottom: 10 },
  history: { marginTop: 12, gap: 6 },
  histItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  histText: { flex: 1, fontSize: 13, color: c.onSurfaceSecondary },
}));
