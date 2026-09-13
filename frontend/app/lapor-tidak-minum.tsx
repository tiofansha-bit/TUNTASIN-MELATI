import { useState } from "react";
import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Button, Icon } from "@/src/components/ui";
import { UNABLE_REASONS } from "@/src/constants";

export default function LaporTidakMinum() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [done, setDone] = useState(false);

  const { data: today } = useQuery<any>({ queryKey: ["patient-today"], queryFn: () => api("/patient/today") });

  const mut = useMutation({
    mutationFn: (reason: string) => api("/patient/unable", { method: "POST", body: { reason } }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      qc.invalidateQueries({ queryKey: ["patient-today"] });
      setDone(true);
    },
  });

  const call = () => Linking.openURL(`tel:${today?.clinic?.phone || ""}`).catch(() => {});

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="back-btn">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Belum bisa minum</Text>
        <View style={{ width: 26 }} />
      </View>

      {!done ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.prompt}>Apa alasan Anda belum bisa minum obat?</Text>
          <View style={styles.grid}>
            {UNABLE_REASONS.map((r) => (
              <Pressable
                key={r.key}
                testID={`reason-${r.key}`}
                style={styles.reasonCard}
                onPress={() => mut.mutate(r.key)}
                disabled={mut.isPending}
              >
                <View style={styles.reasonIcon}>
                  <Icon name={r.icon} size={26} color={colors.brandPrimary} />
                </View>
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.resultIcon}>
            <Icon name="hand-left" size={44} color={colors.onWarning} />
          </View>
          <Text style={styles.resultTitle}>Laporan terkirim</Text>
          <Text style={styles.resultMsg}>
            Jangan menggandakan dosis atau mengubah pengobatan sendiri. Petugas akan membantu menentukan langkah selanjutnya.
          </Text>
          <View style={{ height: 12 }} />
          <Button title="Hubungi Petugas" icon="call" onPress={call} testID="btn-contact-staff" />
          <Button title="Kembali ke Beranda" variant="ghost" onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  content: { padding: 16, gap: 16 },
  prompt: { fontSize: 20, fontWeight: "600", color: c.onSurface, lineHeight: 28 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  reasonCard: { width: "47%", flexGrow: 1, backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, alignItems: "center", gap: 10, minHeight: 120, justifyContent: "center" },
  reasonIcon: { width: 52, height: 52, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  reasonLabel: { fontSize: 15, fontWeight: "600", color: c.onSurface, textAlign: "center" },
  resultIcon: { width: 84, height: 84, borderRadius: 999, backgroundColor: c.warning, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 20 },
  resultTitle: { fontSize: 22, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  resultMsg: { fontSize: 16, color: c.onSurfaceSecondary, textAlign: "center", lineHeight: 24 },
}));
