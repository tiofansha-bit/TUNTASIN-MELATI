import { useLocalSearchParams } from "expo-router";
import { ChatView } from "@/src/components/chat";

export default function ChatPercakapan() {
  const { id, name, code } = useLocalSearchParams<{ id: string; name?: string; code?: string }>();
  return <ChatView mode="staff" patientId={id} title={name || "Pasien"} subtitle={code} />;
}
