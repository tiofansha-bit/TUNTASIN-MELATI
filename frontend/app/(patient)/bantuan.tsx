import { useState } from "react";
import { View, Text, ScrollView, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Card, Icon, Loading, StateView } from "@/src/components/ui";

type Help = {
  clinic: {
    name: string; address: string; phone: string; hours: string;
    chat_hours: string; emergency: string;
  };
  education: { id: string; title: string; body: string }[];
};

const FAQ = [
  { q: "Apa yang saya lakukan jika lupa minum obat?", a: "Segera minum saat ingat pada hari yang sama. Jangan menggandakan dosis. Beri tahu petugas melalui aplikasi." },
  { q: "Bagaimana cara melaporkan efek samping?", a: "Buka menu Hari Ini, tekan tombol 'Ada keluhan', lalu pilih keluhan yang Anda rasakan." },
  { q: "Bolehkah saya berhenti minum obat jika merasa sudah sehat?", a: "Tidak. Menghentikan obat tanpa arahan petugas dapat membuat pengobatan gagal. Selalu konsultasi dulu." },
];

export default function Bantuan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<Help>({
    queryKey: ["patient-help"],
    queryFn: () => api("/patient/help"),
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["patient-unread"],
    queryFn: () => api("/patient/messages/unread"),
  });

  if (isLoading) return <View style={styles.root}><Loading /></View>;
  if (isError || !data)
    return <View style={[styles.root, { paddingTop: insets.top }]}><StateView icon="cloud-offline-outline" title="Gagal memuat" /></View>;

  const call = (num: string) => Linking.openURL(`tel:${num}`).catch(() => {});

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Bantuan</Text>
        <Text style={styles.headerSub}>Kami siap membantu Anda</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bigRow}>
          <Pressable testID="help-chat" style={[styles.bigCard, { backgroundColor: colors.brandPrimary }]} onPress={() => router.push("/chat-pasien")}>
            <Icon name="chatbubbles" size={34} color={colors.onBrandPrimary} />
            <Text style={styles.bigCardText}>Chat Petugas</Text>
            {unread && unread.count > 0 ? (
              <View style={styles.chatBadge}><Text style={styles.chatBadgeText}>{unread.count}</Text></View>
            ) : null}
          </Pressable>
          <Pressable testID="help-call" style={[styles.bigCard, { backgroundColor: colors.info }]} onPress={() => call(data.clinic.phone)}>
            <Icon name="call" size={34} color="#FFFFFF" />
            <Text style={styles.bigCardText}>Telepon Petugas</Text>
          </Pressable>
        </View>

        <Pressable testID="help-emergency" style={styles.emergency} onPress={() => call(data.clinic.emergency)}>
          <Icon name="warning" size={26} color={colors.onError} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyTitle}>Bantuan Darurat</Text>
            <Text style={styles.emergencySub}>Telepon layanan darurat {data.clinic.emergency}</Text>
          </View>
          <Icon name="chevron-forward" size={22} color={colors.onError} />
        </Pressable>

        <Card style={styles.clinicCard}>
          <View style={styles.iconRow}>
            <Icon name="business" size={20} color={colors.brandPrimary} />
            <Text style={styles.clinicName}>{data.clinic.name}</Text>
          </View>
          <InfoLine icon="location-outline" text={data.clinic.address} />
          <InfoLine icon="time-outline" text={`Jam layanan: ${data.clinic.hours}`} />
          <InfoLine icon="chatbubbles-outline" text={`Jam chat: ${data.clinic.chat_hours}`} />
        </Card>

        <Text style={styles.sectionLabel}>Pertanyaan yang sering diajukan</Text>
        {FAQ.map((f, i) => (
          <Card key={i} onPress={() => setOpenFaq(openFaq === i ? null : i)} testID={`faq-${i}`} style={styles.faqCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.faqQ}>{f.q}</Text>
              <Icon name={openFaq === i ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
            </View>
            {openFaq === i ? <Text style={styles.faqA}>{f.a}</Text> : null}
          </Card>
        ))}

        <Text style={styles.sectionLabel}>Materi edukasi</Text>
        {data.education.map((e) => (
          <Card key={e.id} style={styles.eduCard}>
            <View style={styles.iconRow}>
              <Icon name="book-outline" size={18} color={colors.brandPrimary} />
              <Text style={styles.eduTitle}>{e.title}</Text>
            </View>
            <Text style={styles.eduBody}>{e.body}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

function InfoLine({ icon, text }: { icon: any; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.infoLine}>
      <Icon name={icon} size={16} color={colors.muted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: c.onSurface },
  headerSub: { fontSize: 14, color: c.muted, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  bigRow: { flexDirection: "row", gap: 12 },
  bigCard: { flex: 1, borderRadius: 20, paddingVertical: 28, alignItems: "center", gap: 10, minHeight: 120, justifyContent: "center" },
  bigCardText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  chatBadge: { position: "absolute", top: 12, right: 12, backgroundColor: c.error, borderRadius: 999, minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  chatBadgeText: { color: c.onError, fontSize: 12, fontWeight: "700" },
  emergency: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.error, borderRadius: 16, padding: 16 },
  emergencyTitle: { color: c.onError, fontSize: 16, fontWeight: "700" },
  emergencySub: { color: c.onError, fontSize: 13, opacity: 0.9 },
  clinicCard: { gap: 8 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  clinicName: { fontSize: 17, fontWeight: "700", color: c.onSurface },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { flex: 1, fontSize: 14, color: c.onSurfaceSecondary },
  sectionLabel: { fontSize: 16, fontWeight: "600", color: c.onSurface, marginTop: 6 },
  faqCard: { gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  faqQ: { flex: 1, fontSize: 15, fontWeight: "600", color: c.onSurface },
  faqA: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  eduCard: { gap: 6 },
  eduTitle: { fontSize: 15, fontWeight: "600", color: c.onSurface, flex: 1 },
  eduBody: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
}));
