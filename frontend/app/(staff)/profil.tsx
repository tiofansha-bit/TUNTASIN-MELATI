import { useState } from "react";
import { View, Text, ScrollView, Modal, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Card, Icon } from "@/src/components/ui";

export default function StaffProfil() {
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
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}><Icon name="medical" size={38} color={colors.onBrandPrimary} /></View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>Petugas TB • Puskesmas Melati</Text>

        <Card style={styles.infoCard}>
          <View style={styles.infoRow}><Icon name="person-outline" size={18} color={colors.muted} /><Text style={styles.infoText}>Username: {user?.username}</Text></View>
          <View style={styles.infoRow}><Icon name="shield-checkmark-outline" size={18} color={colors.muted} /><Text style={styles.infoText}>Akses hanya pasien dalam penugasan Anda</Text></View>
        </Card>

        <Card onPress={() => setPinModal(true)} testID="btn-change-pin" style={styles.menuItem}>
          <Icon name="key-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.menuText}>Ubah PIN</Text>
          <Icon name="chevron-forward" size={20} color={colors.muted} />
        </Card>

        <View style={styles.noteBox}>
          <Icon name="settings-outline" size={18} color={colors.muted} />
          <Text style={styles.noteText}>
            Ambang batas risiko dan interval pengingat dapat dikonfigurasi. Ekspor laporan (PDF/Excel/CSV) tersedia pada versi web petugas.
          </Text>
        </View>

        <Button title="Keluar dari Semua Perangkat" variant="outline" icon="log-out-outline" onPress={doLogout} testID="btn-logout" />
      </ScrollView>

      <Modal transparent visible={pinModal} animationType="fade" onRequestClose={() => setPinModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPinModal(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.dialogTitle}>Ubah PIN</Text>
            <TextInput testID="input-old-pin" value={oldPin} onChangeText={(t) => setOldPin(t.replace(/[^0-9]/g, ""))} placeholder="PIN lama" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry maxLength={12} style={styles.pinInput} />
            <TextInput testID="input-new-pin" value={newPin} onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ""))} placeholder="PIN baru" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry maxLength={12} style={styles.pinInput} />
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
            <Button title="Simpan" onPress={changePin} loading={busy} testID="btn-save-pin" />
            <Button title="Batal" variant="ghost" onPress={() => setPinModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, alignItems: "center" },
  avatar: { width: 88, height: 88, borderRadius: 999, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 22, fontWeight: "700", color: c.onSurface },
  role: { fontSize: 14, color: c.muted, marginBottom: 8 },
  infoCard: { width: "100%", gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: c.onSurfaceSecondary },
  menuItem: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12 },
  menuText: { flex: 1, fontSize: 16, fontWeight: "600", color: c.onSurface },
  noteBox: { flexDirection: "row", gap: 8, backgroundColor: c.surfaceTertiary, padding: 12, borderRadius: 12, width: "100%" },
  noteText: { flex: 1, fontSize: 13, color: c.onSurfaceTertiary, lineHeight: 19 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 420, backgroundColor: c.surfaceSecondary, borderRadius: 24, padding: 24, gap: 12 },
  dialogTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  pinInput: { backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 14, height: 52, fontSize: 16, color: c.onSurface },
  msg: { fontSize: 13, color: c.brandPrimary, textAlign: "center" },
}));
