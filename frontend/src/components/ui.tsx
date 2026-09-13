import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme, ThemeColors } from "@/src/theme";

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: any;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.onSurface} />;
}

// -------------------------------------------------------------------------- //
export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  loading,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "md" | "lg" | "xl";
  icon?: any;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useButtonStyles();
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "secondary"
        ? colors.brandSecondary
        : variant === "danger"
          ? colors.error
          : "transparent";
  const fg =
    variant === "primary"
      ? colors.onBrandPrimary
      : variant === "secondary"
        ? colors.onBrandSecondary
        : variant === "danger"
          ? colors.onError
          : colors.brandPrimary;
  const heights = { md: 52, lg: 60, xl: 72 };
  const fontSizes = { md: 16, lg: 18, xl: 22 };
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          minHeight: heights[size],
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: colors.borderStrong,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={fontSizes[size] + 2} color={fg} /> : null}
          <Text style={[styles.label, { color: fg, fontSize: fontSizes[size] }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles((c) => ({
  base: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontWeight: "600" },
}));

// -------------------------------------------------------------------------- //
export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
}) {
  const styles = useCardStyles();
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.9 }]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
}));

// -------------------------------------------------------------------------- //
export function Pill({
  label,
  color,
  bg,
  icon,
  testID,
}: {
  label: string;
  color: string;
  bg: string;
  icon?: any;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function RiskPill({ level, testID }: { level: string; testID?: string }) {
  const { colors } = useTheme();
  const map: Record<string, { c: string; label: string }> = {
    hijau: { c: colors.riskGreen, label: "Aman" },
    kuning: { c: colors.riskYellow, label: "Perhatian" },
    oranye: { c: colors.riskOrange, label: "Waspada" },
    merah: { c: colors.riskRed, label: "Mendesak" },
  };
  const m = map[level] ?? map.hijau;
  return <Pill testID={testID} label={m.label} color="#FFFFFF" bg={m.c} icon="ellipse" />;
}

// -------------------------------------------------------------------------- //
export function ProgressBar({ pct, height = 12 }: { pct: number; height?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height,
        backgroundColor: colors.surfaceTertiary,
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(2, Math.min(100, pct))}%`,
          backgroundColor: colors.brandPrimary,
          borderRadius: 999,
        }}
      />
    </View>
  );
}

// -------------------------------------------------------------------------- //
export function StateView({
  icon,
  title,
  subtitle,
  action,
  testID,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{ alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}
    >
      <Ionicons name={icon} size={54} color={colors.muted} />
      <Text style={{ color: colors.onSurface, fontSize: 18, fontWeight: "600", textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ testID }: { testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

// -------------------------------------------------------------------------- //
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <Text style={[{ color: colors.onSurface, fontSize: 18, fontWeight: "600", marginBottom: 4 }, style]}>
      {children}
    </Text>
  );
}

export { ThemeColors };
