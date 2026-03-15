import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

interface FriendlyDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function FriendlyDateTimePicker({ value, onChange, label }: FriendlyDateTimePickerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const isPM = hours >= 12;
  const hour12 = hours % 12 || 12;
  const roundedMin = MINUTES.reduce((prev, curr) => Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev, 0);

  const updateDate = useCallback((updates: { year?: number; month?: number; day?: number; hours?: number; minutes?: number }) => {
    const newYear = updates.year ?? year;
    const newMonth = updates.month ?? month;
    const maxDay = getDaysInMonth(newYear, newMonth);
    const newDay = Math.min(updates.day ?? day, maxDay);
    const newHours = updates.hours ?? hours;
    const newMinutes = updates.minutes ?? minutes;
    const d = new Date(newYear, newMonth, newDay, newHours, newMinutes, 0, 0);
    onChange(d);
  }, [year, month, day, hours, minutes, onChange]);

  const setHour12 = useCallback((h12: number) => {
    const newHours = isPM ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
    updateDate({ hours: newHours });
  }, [isPM, updateDate]);

  const toggleAMPM = useCallback(() => {
    updateDate({ hours: isPM ? hours - 12 : hours + 12 });
  }, [isPM, hours, updateDate]);

  const formatted = `${MONTHS[month]} ${day}, ${year}  ${hour12}:${String(roundedMin).padStart(2, "0")} ${isPM ? "PM" : "AM"}`;

  const daysInMonth = getDaysInMonth(year, month);
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const yearOptions = [year - 1, year, year + 1, year + 2];

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable style={styles.displayBtn} onPress={() => setExpanded(!expanded)}>
        <Feather name="calendar" size={16} color={colors.accent} />
        <Text style={styles.displayText}>{formatted}</Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
      </Pressable>

      {expanded && (
        <View style={styles.pickerContainer}>
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Month</Text>
            <View style={styles.chipRow}>
              {MONTHS.map((m, i) => (
                <Pressable key={m} style={[styles.chip, month === i && styles.chipActive]} onPress={() => updateDate({ month: i })}>
                  <Text style={[styles.chipText, month === i && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Day</Text>
            <View style={styles.chipRow}>
              {dayOptions.map((d) => (
                <Pressable key={d} style={[styles.chipSmall, day === d && styles.chipActive]} onPress={() => updateDate({ day: d })}>
                  <Text style={[styles.chipSmallText, day === d && styles.chipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Year</Text>
            <View style={styles.chipRow}>
              {yearOptions.map((y) => (
                <Pressable key={y} style={[styles.chip, year === y && styles.chipActive]} onPress={() => updateDate({ year: y })}>
                  <Text style={[styles.chipText, year === y && styles.chipTextActive]}>{y}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.timeSectionRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.pickerLabel}>Hour</Text>
              <View style={styles.chipRow}>
                {HOURS_12.map((h) => (
                  <Pressable key={h} style={[styles.chipSmall, hour12 === h && styles.chipActive]} onPress={() => setHour12(h)}>
                    <Text style={[styles.chipSmallText, hour12 === h && styles.chipTextActive]}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.timeBlock}>
              <Text style={styles.pickerLabel}>Minute</Text>
              <View style={styles.chipRow}>
                {MINUTES.map((m) => (
                  <Pressable key={m} style={[styles.chipSmall, roundedMin === m && styles.chipActive]} onPress={() => updateDate({ minutes: m })}>
                    <Text style={[styles.chipSmallText, roundedMin === m && styles.chipTextActive]}>{String(m).padStart(2, "0")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.ampmBlock}>
              <Text style={styles.pickerLabel}>AM/PM</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, !isPM && styles.chipActive]} onPress={() => { if (isPM) toggleAMPM(); }}>
                  <Text style={[styles.chipText, !isPM && styles.chipTextActive]}>AM</Text>
                </Pressable>
                <Pressable style={[styles.chip, isPM && styles.chipActive]} onPress={() => { if (!isPM) toggleAMPM(); }}>
                  <Text style={[styles.chipText, isPM && styles.chipTextActive]}>PM</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  displayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  displayText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.text,
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 14,
  },
  pickerSection: {},
  pickerLabel: {
    fontSize: 11,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.text,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.background,
    minWidth: 32,
    alignItems: "center",
  },
  chipSmallText: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.text,
  },
  timeSectionRow: {
    gap: 14,
  },
  timeBlock: {},
  ampmBlock: {},
});
