import { useState } from "react";
import { View, Text, ScrollView, Pressable, Linking, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Button, Icon } from "@/src/components/ui";
import { SYMPTOMS } from "@/src/constants";

const SEVERITIES = [
  { key: "ringan", label: "Ringan", icon: "happy-outline" },
  { key: "sedang", label: "Sedang", icon: "alert-outline" },
  { key: "berat", label: "Berat", icon: "warning-outline" },
];

export default function LaporKeluhan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [severity, setSeverity] = useState("ringan");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ is_severe: boolean; message: string } | null>(null);

  const { data: today } = useQuery<any>({ queryKey: ["patient-today"], queryFn: () => api("/patient/today") });

  const mut = useMutation({
    mutationFn: () => api("/patient/symptom", { method: "POST", body: { symptoms: selected, severity, note } }),
    onSuccess: (res: any) => {
      Haptics.notificationAsync(
        res.is_severe ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
      qc.invalidateQueries({ queryKey: ["patient-today"] });
      setResult(res);
    },
  });

  const toggle = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  };

  const call = (num?: string) => Linking.openURL(`tel:${num || ""}`).catch(() => {});
  const maps = () => {
    const c = today?.clinic;
    Linking.openURL(`https://maps.google.com/?q=${c?.lat || 0},${c?.lng || 0}`).catch(() => {});
  };

  if (result) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={{ width: 26 }} />
          <Text style={styles.headerTitle}>{result.is_severe ? "Perlu segera dinilai" : "Terima kasih"}</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.resultIcon, { backgroundColor: result.is_severe ? colors.error : colors.success }]}>
            <Icon name={result.is_severe ? "warning" : "checkmark"} size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.resultMsg}>{result.message}</Text>
          {result.is_severe ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Button title="Hubungi Petugas" icon="call" variant="danger" onPress={() => call(today?.clinic?.phone)} testID="btn-contact-staff" />
              <Button title="Lihat Lokasi Puskesmas" icon="location" variant="outline" onPress={maps} testID="btn-location" />
              <Button title={`Telepon Darurat ${today?.clinic?.emergency || "119"}`} icon="medical" variant="outline" onPress={() => call(today?.clinic?.emergency)} testID="btn-emergency" />
            </View>
          ) : null}
          <Button title="Kembali ke Beranda" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (step === 2 ? setStep(1) : router.back())} hitSlop={12} testID="back-btn">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Ada keluhan</Text>
        <Text style={styles.stepText}>{step}/2</Text>
      </View>

      {step === 1 ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.prompt}>Keluhan apa yang Anda rasakan?</Text>
            <Text style={styles.hint}>Pilih satu atau lebih.</Text>
            <View style={styles.symptomList}>
              {SYMPTOMS.map((s) => {
                const on = selected.includes(s.key);
                return (
                  <Pressable
                    key={s.key}
                    testID={`symptom-${s.key}`}
                    style={[styles.symptomChip, on && styles.symptomChipOn]}
                    onPress={() => toggle(s.key)}
                  >
                    <Icon name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.brandPrimary : colors.muted} />
                    <Text style={[styles.symptomText, on && { color: colors.onSurface, fontWeight: "600" }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Button title="Lanjutkan" onPress={() => setStep(2)} disabled={selected.length === 0} size="lg" testID="btn-continue" />
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.prompt}>Seberapa berat keluhannya?</Text>
            <View style={styles.sevRow}>
              {SEVERITIES.map((s) => {
                const on = severity === s.key;
                const col = s.key === "berat" ? colors.error : s.key === "sedang" ? colors.warning : colors.brandPrimary;
                return (
                  <Pressable
                    key={s.key}
                    testID={`severity-${s.key}`}
                    style={[styles.sevCard, on && { borderColor: col, backgroundColor: col + "18" }]}
                    onPress={() => setSeverity(s.key)}
                  >
                    <Icon name={s.icon} size={28} color={on ? col : colors.muted} />
                    <Text style={[styles.sevText, on && { color: col, fontWeight: "700" }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Catatan singkat (opsional)</Text>
            <TextInput
              testID="symptom-note"
              value={note}
              onChangeText={setNote}
              placeholder="Contoh: mulai terasa sejak tadi pagi"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.noteInput}
            />
            <View style={styles.disclaimerBox}>
              <Icon name="information-circle-outline" size={18} color={colors.info} />
              <Text style={styles.disclaimerText}>
                Anda tidak perlu menentukan diagnosis atau obat penyebab. Petugas yang akan menilai.
              </Text>
            </View>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Button title="Kirim Laporan" onPress={() => mut.mutate()} loading={mut.isPending} size="lg" testID="btn-submit-symptom" />
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  stepText: { fontSize: 14, fontWeight: "600", color: c.muted, width: 26, textAlign: "right" },
  content: { padding: 16, gap: 12 },
  prompt: { fontSize: 20, fontWeight: "600", color: c.onSurface },
  hint: { fontSize: 14, color: c.muted },
  symptomList: { gap: 8 },
  symptomChip: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 54 },
  symptomChipOn: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  symptomText: { flex: 1, fontSize: 15, color: c.onSurfaceSecondary, paddingVertical: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
  sevRow: { flexDirection: "row", gap: 12 },
  sevCard: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border, borderRadius: 16, paddingVertical: 20, alignItems: "center", gap: 8 },
  sevText: { fontSize: 15, color: c.onSurfaceSecondary },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary, marginTop: 8 },
  noteInput: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, fontSize: 15, color: c.onSurface, minHeight: 80, textAlignVertical: "top" },
  disclaimerBox: { flexDirection: "row", gap: 8, backgroundColor: "#EFF6FF", padding: 12, borderRadius: 12 },
  disclaimerText: { flex: 1, fontSize: 13, color: c.info, lineHeight: 19 },
  resultIcon: { width: 84, height: 84, borderRadius: 999, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 20 },
  resultMsg: { fontSize: 16, color: c.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
}));
