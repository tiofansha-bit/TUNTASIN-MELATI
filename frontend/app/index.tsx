import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role === "staff") return <Redirect href="/(staff)" />;
  return <Redirect href="/(patient)" />;
}
