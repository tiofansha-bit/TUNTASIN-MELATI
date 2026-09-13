// Design tokens for Melati TUNTASin. Light theme (calming jasmine green).
// Keys match design_guidelines.json "color" block, plus semantic tokens for
// dose-confirmation calendar statuses and patient risk levels.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#F8FAF9",
  onSurface: "#0F172A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#0F172A",
  surfaceTertiary: "#EEF2F0",
  onSurfaceTertiary: "#1E293B",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#64748B",

  // Brand — jasmine green
  brand: "#10B981",
  onBrand: "#FFFFFF",
  brandPrimary: "#10B981",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D1FAE5",
  onBrandSecondary: "#065F46",
  brandTertiary: "#ECFDF5",
  onBrandTertiary: "#047857",

  // Status
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  // Lines
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",

  // Dose calendar statuses (color + used with icon/label, never color-only)
  doseTaken: "#10B981",      // green: dikonfirmasi sudah minum
  doseLate: "#F59E0B",       // kuning: dikonfirmasi terlambat
  doseNotYet: "#CBD5E1",     // abu-abu: belum waktunya
  doseUnconfirmed: "#FB923C",// oranye: belum terkonfirmasi
  doseMissed: "#EF4444",     // merah: melaporkan tidak minum

  // Risk levels
  riskGreen: "#10B981",
  riskYellow: "#FACC15",
  riskOrange: "#FB923C",
  riskRed: "#EF4444",

  // Soft tints for cards
  tealSoft: "#CCFBF1",
  onTealSoft: "#0F766E",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
