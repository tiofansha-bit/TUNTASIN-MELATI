import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Icon, Loading, StateView } from "@/src/components/ui";
import { fmtDateShort, fmtTime } from "@/src/utils/date";

type Convo = {
  patient_id: string;
  name: string;
  code: string;
  kelurahan?: string;
  last_text?: string | null;
  last_at?: string | null;
  last_sender?: string | null;
  unread: number;
};

export default function ChatDaftar() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{ conversations: Convo[] }>({
    queryKey: ["staff-conversations"],
    queryFn: () => api("/staff/conversations"),
  });

  const convos = data?.conversations ?? [];

  const openThread = (c: Convo) =>
    router.push({
      pathname: "/chat-percakapan",
      params: { id: c.patient_id, name: c.name, code: c.code },
    });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} testID="chatlist-back" hitSlop={10} style={styles.iconBtn}>
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Chat Pasien</Text>
          <Text style={styles.hSub}>Percakapan dengan pasien Anda</Text>
        </View>
      </View>

      {isLoading ? (
        <Loading testID="chatlist-loading" />
      ) : isError ? (
        <View style={styles.center}>
          <StateView icon="cloud-offline-outline" title="Gagal memuat percakapan" />
        </View>
      ) : (
        <FlatList
          testID="chatlist"
          data={convos}
          keyExtractor={(c) => c.patient_id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <StateView icon="chatbubbles-outline" title="Belum ada pasien" />
            </View>
          }
          renderItem={({ item }) => {
            const initial = item.name?.charAt(0)?.toUpperCase() ?? "?";
            const preview = item.last_text
              ? `${item.last_sender === "staff" ? "Anda: " : ""}${item.last_text}`
              : "Belum ada pesan";
            return (
              <Pressable
                testID={`convo-${item.patient_id}`}
                style={styles.row}
                onPress={() => openThread(item)}
              >
                <View style={[styles.avatar, item.unread > 0 && styles.avatarUnread]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {item.last_at ? (
                      <Text style={styles.time}>
                        {fmtDateShort(item.last_at)} {fmtTime(item.last_at)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowBottom}>
                    <Text
                      style={[styles.preview, item.unread > 0 && styles.previewUnread]}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>
                    {item.unread > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.code}{item.kelurahan ? ` • ${item.kelurahan}` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
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
  hTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  hSub: { fontSize: 13, color: c.muted, marginTop: 1 },
  listContent: { paddingHorizontal: 12, paddingTop: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUnread: { backgroundColor: c.brandPrimary },
  avatarText: { fontSize: 20, fontWeight: "700", color: c.onBrandSecondary },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: c.onSurface },
  time: { fontSize: 11, color: c.muted },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  preview: { flex: 1, fontSize: 14, color: c.muted },
  previewUnread: { color: c.onSurface, fontWeight: "600" },
  badge: {
    backgroundColor: c.brandPrimary,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "700" },
  meta: { fontSize: 12, color: c.muted },
}));
