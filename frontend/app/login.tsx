import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Icon } from "@/src/components/ui";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!username.trim() || pin.length < 4) {
      setError("Isi username dan PIN (minimal 4 angka).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const role = await login(username.trim(), pin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(role === "staff" ? "/(staff)" : "/(patient)");
    } catch (e: any) {
      setError(e?.message || "Username atau PIN salah");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u: string) {
    setUsername(u);
    setPin("1234");
    setError("");
  }

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../assets/images/logo.webp")}
          style={styles.logo}
          contentFit="contain"
          testID="app-logo"
        />
        <Text style={styles.subtitle}>Pendamping pengobatan Anda hingga tuntas</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputWrap}>
            <Icon name="person-outline" size={20} color={colors.muted} />
            <TextInput
              testID="login-username-input"
              value={username}
              onChangeText={setUsername}
              placeholder="Contoh: pasien"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <Text style={styles.label}>PIN</Text>
          <View style={styles.inputWrap}>
            <Icon name="lock-closed-outline" size={20} color={colors.muted} />
            <TextInput
              testID="login-pin-input"
              value={pin}
              onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
              placeholder="Masukkan PIN"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={12}
              style={styles.input}
            />
          </View>

          {error ? (
            <View style={styles.errorBox} testID="login-error">
              <Icon name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button title="Masuk" onPress={submit} loading={loading} size="lg" testID="login-submit-button" />

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Akun demo (PIN: 1234)</Text>
            <View style={styles.demoRow}>
              <Pressable testID="demo-patient" style={styles.demoChip} onPress={() => fillDemo("pasien")}>
                <Icon name="person" size={16} color={colors.onBrandTertiary} />
                <Text style={styles.demoChipText}>Pasien: pasien</Text>
              </Pressable>
              <Pressable testID="demo-staff" style={styles.demoChip} onPress={() => fillDemo("petugas")}>
                <Icon name="medical" size={16} color={colors.onBrandTertiary} />
                <Text style={styles.demoChipText}>Petugas: petugas</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 24, alignItems: "center" },
  logo: {
    width: 280,
    height: 112,
    marginBottom: 12,
  },
  title: { fontSize: 28, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 15, color: c.muted, marginTop: 2, textAlign: "center", marginBottom: 32 },
  form: { width: "100%", maxWidth: 420, gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: c.onSurfaceSecondary, marginTop: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 56,
  },
  input: { flex: 1, fontSize: 16, color: c.onSurface, height: "100%" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: c.error, fontSize: 14, flex: 1 },
  demoBox: { marginTop: 20, gap: 10 },
  demoTitle: { fontSize: 13, color: c.muted, fontWeight: "600" },
  demoRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  demoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.brandTertiary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  demoChipText: { color: c.onBrandTertiary, fontSize: 13, fontWeight: "600" },
}));
