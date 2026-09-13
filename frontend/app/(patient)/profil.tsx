import { useState } from "react";
import { View, Text, ScrollView, Modal, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Card, Icon, Loading } from "@/src/components/ui";
import { fmtDate } from "@/src/utils/date";

export default function Profil() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [pinModal, setPinModal] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery<any>({ queryKey: ["patient-today"], queryFn: () => api("/patient/today") });

  async function doLogout() {
    await logout();
    router.replace("/login");
  }

  async function changePin() {
    if (newPin.length < 4) { setMsg("PIN baru minimal 4 angka"); return; }
    setBusy(true); setMsg("");
    try {
      await api("/auth/change-pin", { method: "POST", body: { old_pin: oldPin, new_pin: newPin } });
      setMsg("PIN berhasil diubah");
      setOldPin(""); setNewPin("");
      setTimeout(() => setPinModal(false), 800);
    } catch (e: any) {
      setMsg(e?.message || "Gagal mengubah PIN");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <View style={styles.root}><Loading /></View>;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user.name || "?").charAt(0)}</Text>
        </View>
        <Text style={styles.name} testID="profile-name">{user.name}</Text>
        <Text style={styles.username}>@{user.username}</Text>

        <Card style={styles.infoCard}>
          <Row label="Tahap pengobatan" value={data?.phase === "awal" ? "Tahap Awal" : "Tahap Lanjutan"} />
          <Row label="Hari pengobatan" value={data ? `Hari ke-${data.treatment_day}` : "-"} />
          <Row label="Perkiraan selesai" value={fmtDate(data?.est_end_date) || "-"} />
        </Card>

        <Card onPress={() => setPinModal(true)} testID="btn-change-pin" style={styles.menuItem}>
          <Icon name="key-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.menuText}>Ubah PIN</Text>
          <Icon name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        <View style={styles.consentBox}>
          <Icon name="shield-checkmark-outline" size={18} color={colors.muted} />
          <Text style={styles.consentText}>
            Data Anda dijaga kerahasiaannya dan hanya digunakan untuk mendukung pengobatan. Notifikasi tidak menampilkan nama penyakit.
          </Text>
        </View>

        <Button title="Keluar" variant="outline" icon="log-out-outline" onPress={doLogout} testID="btn-logout" />
      </ScrollView>

      <Modal transparent visible={pinModal} animationType="fade" onRequestClose={() => setPinModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPinModal(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.dialogTitle}>Ubah PIN</Text>
            <TextInput
              testID="input-old-pin"
              value={oldPin} onChangeText={(t) => setOldPin(t.replace(/[^0-9]/g, ""))}
              placeholder="PIN lama" placeholderTextColor={colors.muted}
              keyboardType="number-pad" secureTextEntry maxLength={12} style={styles.pinInput}
            />
            <TextInput
              testID="input-new-pin"
              value={newPin} onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ""))}
              placeholder="PIN baru" placeholderTextColor={colors.muted}
              keyboardType="number-pad" secureTextEntry maxLength={12} style={styles.pinInput}
            />
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
            <Button title="Simpan" onPress={changePin} loading={busy} testID="btn-save-pin" />
            <Button title="Batal" variant="ghost" onPress={() => setPinModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, alignItems: "center" },
  avatar: { width: 88, height: 88, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontSize: 36, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: c.onSurface },
  username: { fontSize: 14, color: c.muted, marginBottom: 8 },
  infoCard: { width: "100%", gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: c.muted },
  rowValue: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  menuItem: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12 },
  menuText: { flex: 1, fontSize: 16, fontWeight: "600", color: c.onSurface },
  consentBox: { flexDirection: "row", gap: 8, backgroundColor: c.surfaceTertiary, padding: 12, borderRadius: 12, width: "100%" },
  consentText: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 420, backgroundColor: c.surfaceSecondary, borderRadius: 24, padding: 24, gap: 12 },
  dialogTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  pinInput: { backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 14, height: 52, fontSize: 16, color: c.onSurface },
  msg: { fontSize: 13, color: c.brandPrimary, textAlign: "center" },
}));
