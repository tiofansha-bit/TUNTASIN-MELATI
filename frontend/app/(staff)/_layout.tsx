import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";

export default function StaffLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="pasien"
        options={{ title: "Pasien", tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="alert"
        options={{ title: "Alert", tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
