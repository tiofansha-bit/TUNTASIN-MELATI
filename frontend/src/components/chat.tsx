import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Icon, Loading, StateView } from "@/src/components/ui";
import { fmtTime, fmtDateShort } from "@/src/utils/date";

type Msg = {
  id: string;
  sender_role: "patient" | "staff";
  sender_name: string;
  text: string;
  created_at: string;
};

type ChatData = {
  messages: Msg[];
  chat_hours?: string | null;
  clinic_name?: string | null;
};

export function ChatView({
  mode,
  patientId,
  title,
  subtitle,
}: {
  mode: "patient" | "staff";
  patientId?: string;
  title: string;
  subtitle?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [headerH, setHeaderH] = useState(88);

  const path = mode === "patient" ? "/patient/messages" : `/staff/patients/${patientId}/messages`;
  const messagesKey = mode === "patient" ? ["patient-messages"] : ["staff-messages", patientId];

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<ChatData>({
    queryKey: messagesKey,
    queryFn: () => api(path),
  });

  const send = useMutation({
    mutationFn: (t: string) => api(path, { method: "POST", body: { text: t } }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.invalidateQueries({
        queryKey: mode === "patient" ? ["patient-unread"] : ["staff-unread"],
      });
      if (mode === "staff") queryClient.invalidateQueries({ queryKey: ["staff-conversations"] });
    },
  });

  const messages = data?.messages ?? [];
  const listData = useMemo(() => [...messages].reverse(), [messages]);
  const chatHours = data?.chat_hours;
  const headerSub = subtitle ?? (mode === "patient" ? data?.clinic_name ?? undefined : undefined);

  const onSend = () => {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate(t);
  };

  const InfoBanner =
    mode === "patient" && chatHours ? (
      <View style={styles.infoBanner} testID="chat-hours-banner">
        <Icon name="time-outline" size={16} color={colors.onBrandTertiary} />
        <Text style={styles.infoText}>
          Jam layanan chat: {chatHours}. Pesan Anda akan dibalas petugas pada jam kerja.
        </Text>
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <View
        style={[styles.header, { paddingTop: insets.top + 10 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <Pressable onPress={() => router.back()} testID="chat-back" hitSlop={10} style={styles.iconBtn}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.hTitle} numberOfLines={1}>{title}</Text>
          {headerSub ? <Text style={styles.hSub} numberOfLines={1}>{headerSub}</Text> : null}
        </View>
        <Pressable onPress={() => refetch()} testID="chat-refresh" hitSlop={10} style={styles.iconBtn}>
          {isRefetching ? (
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          ) : (
            <Icon name="refresh" size={20} color={colors.onSurface} />
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="translate-with-padding"
        keyboardVerticalOffset={headerH}
      >
        {isLoading ? (
          <Loading testID="chat-loading" />
        ) : isError ? (
          <View style={styles.center}>
            <StateView
              icon="cloud-offline-outline"
              title="Gagal memuat percakapan"
              subtitle="Periksa koneksi Anda lalu coba lagi."
            />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            {InfoBanner}
            <View style={styles.center}>
              <StateView
                icon="chatbubbles-outline"
                title="Belum ada percakapan"
                subtitle={
                  mode === "patient"
                    ? "Sampaikan pertanyaan atau keluhan Anda. Petugas akan membalas."
                    : "Belum ada pesan dari pasien ini. Anda bisa memulai percakapan."
                }
                testID="chat-empty"
              />
            </View>
          </View>
        ) : (
          <FlatList
            testID="chat-list"
            data={listData}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={InfoBanner}
            renderItem={({ item }) => <Bubble m={item} mine={item.sender_role === mode} />}
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Tulis pesan…"
            placeholderTextColor={colors.muted}
            multiline
          />
          <Pressable
            testID="chat-send"
            onPress={onSend}
            disabled={!text.trim() || send.isPending}
            style={[styles.sendBtn, { opacity: !text.trim() || send.isPending ? 0.5 : 1 }]}
          >
            {send.isPending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Icon name="send" size={20} color={colors.onBrandPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ m, mine }: { m: Msg; mine: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, mine ? styles.textMine : styles.textOther]}>{m.text}</Text>
        <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
          {fmtDateShort(m.created_at)} • {fmtTime(m.created_at)}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, paddingTop: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  hTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  hSub: { fontSize: 13, color: c.muted, marginTop: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  infoBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: c.brandTertiary,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 12.5, color: c.onBrandTertiary, lineHeight: 18 },
  bubbleRow: { width: "100%", flexDirection: "row" },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: c.surfaceSecondary,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  textMine: { color: c.onBrandPrimary },
  textOther: { color: c.onSurface },
  time: { fontSize: 10.5, marginTop: 4 },
  timeMine: { color: c.onBrandPrimary, opacity: 0.85, textAlign: "right" },
  timeOther: { color: c.muted },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: c.onSurface,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
