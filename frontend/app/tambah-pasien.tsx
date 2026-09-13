import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { api, ApiError } from "@/src/api/client";
import { Button, Icon } from "@/src/components/ui";

export default function TambahPasien() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [kelurahan, setKelurahan] = useState("");
  const [error, setError] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      api<{ id: string; code: string; username: string }>("/staff/patients", {
        method: "POST",
        body: {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          pin: pin.trim(),
          phone: phone.trim(),
          kelurahan: kelurahan.trim(),
        },
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ["staff-patients"] });
      qc.invalidateQueries({ queryKey: ["staff-dashboard"] });
      router.back();
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : "Gagal menambah pasien. Coba lagi.");
    },
  });

  const submit = () => {
    setError("");
    if (!name.trim()) return setError("Nama wajib diisi.");
    if (username.trim().length < 3) return setError("Username minimal 3 karakter.");
    if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username.trim().toLowerCase()))
      return setError("Username hanya boleh huruf kecil, angka, titik, garis bawah/strip.");
    if (!/^\d{4,12}$/.test(pin.trim())) return setError("PIN harus 4–12 digit angka.");
    if (!kelurahan.trim()) return setError("Kelurahan wajib diisi.");
    mut.mutate();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="addpatient-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Tambah Pasien</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <Text style={styles.hint}>
          Buat akun pasien baru. Pasien masuk dengan username dan PIN ini. Rincian pengobatan lain
          bisa diatur lewat "Kelola Rencana Pengobatan".
        </Text>

        <Field label="Nama lengkap" testID="field-name">
          <TextInput
            testID="input-name"
            value={name}
            onChangeText={setName}
            placeholder="mis. Budi Santoso"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        <Field label="Username (untuk login pasien)" testID="field-username">
          <TextInput
            testID="input-username"
            value={username}
            onChangeText={setUsername}
            placeholder="mis. budi.santoso"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </Field>

        <Field label="PIN awal (4–12 angka)" testID="field-pin">
          <TextInput
            testID="input-pin"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
            placeholder="mis. 1234"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={12}
            style={styles.input}
          />
        </Field>

        <Field label="Nomor HP" testID="field-phone">
          <TextInput
            testID="input-phone"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ""))}
            placeholder="mis. 081234567890"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </Field>

        <Field label="Kelurahan" testID="field-kelurahan">
          <TextInput
            testID="input-kelurahan"
            value={kelurahan}
            onChangeText={setKelurahan}
            placeholder="mis. Melati Jaya"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        {error ? (
          <View style={styles.errorBox} testID="addpatient-error">
            <Icon name="alert-circle" size={16} color={colors.onError} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          title="Simpan Pasien"
          icon="checkmark"
          onPress={submit}
          loading={mut.isPending}
          testID="btn-save-patient"
          style={{ marginTop: 8 }}
        />
        <Button title="Batal" variant="ghost" onPress={() => router.back()} testID="btn-cancel-patient" />
      </KeyboardAwareScrollView>
    </View>
  );
}

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  content: { padding: 16, gap: 6 },
  hint: { fontSize: 13, color: c.muted, lineHeight: 19, marginBottom: 8 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginBottom: 6 },
  input: {
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 15,
    color: c.onSurface,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.error,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  errorText: { flex: 1, color: c.onError, fontSize: 13, fontWeight: "600" },
}));
