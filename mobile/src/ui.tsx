import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { C, S } from "./theme";

/**
 * Small shared building blocks so every mobile screen looks like the same app —
 * the native counterpart of the web design system. Screens compose these rather
 * than hand-rolling panels and buttons.
 */

export function Panel({ children, tone }: { children: ReactNode; tone?: "default" | "good" | "warn" }) {
  return (
    <View style={[S.panel, tone === "good" && { borderColor: C.post }, tone === "warn" && { borderColor: C.accent }]}>
      {children}
    </View>
  );
}

export function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <View style={[S.row, { justifyContent: "space-between" }]}>
      <Text style={S.h2}>{title}</Text>
      {typeof aside === "string" ? (
        <View style={S.pill}>
          <Text style={S.pillText}>{aside}</Text>
        </View>
      ) : (
        aside
      )}
    </View>
  );
}

export function Pill({ label, tone = "muted" }: { label: string; tone?: "muted" | "good" | "accent" }) {
  const color = tone === "good" ? C.post : tone === "accent" ? C.accent : C.muted;
  return (
    <View style={[S.pill, tone !== "muted" && { borderColor: color }]}>
      <Text style={[S.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Btn({
  label,
  onPress,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[variant === "primary" ? S.btn : S.btnGhost, disabled && { opacity: 0.55 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={variant === "primary" ? S.btnText : [S.segText, { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A tappable option in a row of choices. */
export function Choice<T extends string>({
  value,
  current,
  label,
  onPress,
}: {
  value: T;
  current: T;
  label: string;
  onPress: (v: T) => void;
}) {
  const active = value === current;
  return (
    <Pressable accessibilityRole="button" style={[S.seg, active && S.segActive]} onPress={() => onPress(value)}>
      <Text style={[S.segText, active && S.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ minWidth: 78 }}>
      <Text style={S.statValue}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
      {note && <Text style={[S.statLabel, { color: C.muted, opacity: 0.75 }]}>{note}</Text>}
    </View>
  );
}

/** A labelled 0–100 bar — used for score components and coverage. */
export function Meter({ value, tone = C.accent }: { value: number; tone?: string }) {
  return (
    <View style={{ height: 6, backgroundColor: C.panel2, borderRadius: 999, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 6, backgroundColor: tone }} />
    </View>
  );
}

export function ErrorText({ message }: { message: string }) {
  return <Text style={[S.muted, { color: C.accent }]}>{message}</Text>;
}

export function Loading() {
  return <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />;
}

/** Honest empty state — we say there's nothing rather than inventing numbers. */
export function Empty({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={S.muted}>{text}</Text>
      {action && <Btn label={action.label} onPress={action.onPress} variant="ghost" />}
    </View>
  );
}

/** Stepper for a numeric field, so no keyboard is needed for common edits. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <View style={[S.row, { justifyContent: "space-between" }]}>
      <Text style={S.label}>
        {label}: {value}
        {suffix}
      </Text>
      <View style={S.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={S.stepBtn}
          onPress={() => onChange(Math.max(min, value - step))}
        >
          <Text style={S.stepBtnText}>−</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={S.stepBtn}
          onPress={() => onChange(Math.min(max, value + step))}
        >
          <Text style={S.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
