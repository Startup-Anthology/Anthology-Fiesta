import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EventDetailModal from "@/components/EventDetailModal";
import { ErrorState } from "@/components/ErrorState";
import FriendlyDateTimePicker from "@/components/FriendlyDateTimePicker";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const EVENT_TYPES = ["demo", "follow-up", "meeting", "other"];
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getWeekRange(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function weekOffsetFromToday(date: Date): number {
  const today = new Date();
  const todayWeekStart = new Date(today);
  todayWeekStart.setDate(todayWeekStart.getDate() - todayWeekStart.getDay());
  todayWeekStart.setHours(0, 0, 0, 0);
  const targetWeekStart = new Date(date);
  targetWeekStart.setDate(targetWeekStart.getDate() - targetWeekStart.getDay());
  targetWeekStart.setHours(0, 0, 0, 0);
  return Math.round((targetWeekStart.getTime() - todayWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());

  const EVENT_TYPE_COLORS: Record<string, string> = {
    demo: colors.statusNew,
    "follow-up": colors.warning,
    meeting: colors.info,
    email: colors.success,
    other: colors.textTertiary,
  };

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekRange(baseDate), [baseDate]);

  const updateEventMut = useMutation({
    mutationFn: ({ evId, data }: { evId: number; data: any }) => api.updateCalendarEvent(evId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendarEvents"] });
      setSelectedEvent(null);
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });

  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["calendarEvents", weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: () => api.getCalendarEvents({ startDate: weekStart.toISOString(), endDate: weekEnd.toISOString() }),
  });

  const hasSynced = useRef(false);
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true;
      api.syncCalendar().then(() => refetch()).catch(() => {});
    }
  }, []);

  const handleRefresh = async () => {
    try { await api.syncCalendar(); } catch {}
    refetch();
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const dayGroups = useMemo(() => {
    const days: { date: Date; label: string; shortLabel: string; events: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dayEvents = events
        .filter((e: any) => isSameDay(new Date(e.startTime), d))
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      days.push({
        date: d,
        label: d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        shortLabel: d.toLocaleDateString([], { weekday: "short", day: "numeric" }),
        events: dayEvents,
      });
    }
    return days;
  }, [events, weekStart]);

  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  function jumpToDate(date: Date, openDayView = false) {
    const newOffset = weekOffsetFromToday(date);
    setWeekOffset(newOffset);
    if (openDayView) setSelectedDay(date);
    else setSelectedDay(null);
    setShowPicker(false);
    setPickerMonth(date);
  }

  function stepDay(dir: 1 | -1) {
    if (!selectedDay) return;
    const next = new Date(selectedDay);
    next.setDate(next.getDate() + dir);
    jumpToDate(next, true);
  }

  // Day view events
  const dayViewEvents = useMemo(() => {
    if (!selectedDay) return [];
    return events
      .filter((e: any) => isSameDay(new Date(e.startTime), selectedDay))
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [selectedDay, events]);

  const dayViewLabel = selectedDay
    ? selectedDay.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
    : "";

  function renderEventCard(ev: any) {
    return (
      <Pressable
        key={ev.id}
        style={[styles.eventCard, { backgroundColor: colors.surface }]}
        onPress={() => setSelectedEvent(ev)}
        accessibilityRole="button"
        accessibilityLabel={`${ev.title}, ${formatTime(ev.startTime)}, ${ev.eventType}`}
        accessibilityHint="Double tap to view or edit this event"
      >
        <View style={[styles.eventStripe, { backgroundColor: EVENT_TYPE_COLORS[ev.eventType] || colors.textTertiary }]} />
        <View style={styles.eventBody}>
          <View style={styles.eventTop}>
            <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
            <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{formatTime(ev.startTime)}</Text>
          </View>
          {ev.description ? <Text style={[styles.eventDesc, { color: colors.textSecondary }]} numberOfLines={2}>{ev.description}</Text> : null}
          <View style={styles.eventMeta}>
            <View style={[styles.typeBadge, { backgroundColor: (EVENT_TYPE_COLORS[ev.eventType] || colors.textTertiary) + "15" }]}>
              <Text style={[styles.typeText, { color: EVENT_TYPE_COLORS[ev.eventType] || colors.textTertiary }]}>{ev.eventType}</Text>
            </View>
            {ev.leadId && (
              <Pressable onPress={() => router.push({ pathname: "/lead/[id]", params: { id: String(ev.leadId) } })} style={styles.linkBadge}>
                <Feather name="target" size={12} color={colors.info} />
                <Text style={[styles.linkText, { color: colors.info }]}>{ev.leadName || `Lead #${ev.leadId}`}</Text>
              </Pressable>
            )}
            {ev.contactId && (
              <Pressable onPress={() => router.push({ pathname: "/contact/[id]", params: { id: String(ev.contactId) } })} style={styles.linkBadge}>
                <Feather name="user" size={12} color={colors.info} />
                <Text style={[styles.linkText, { color: colors.info }]}>{ev.contactName || `Contact #${ev.contactId}`}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {selectedDay && (
            <Pressable onPress={() => setSelectedDay(null)} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to week view">
              <Feather name="chevron-left" size={20} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>Week</Text>
            </Pressable>
          )}
          {!selectedDay && <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>}
        </View>
        <HamburgerMenu />
      </View>

      {/* Navigation bar */}
      <View style={styles.weekNav}>
        <Pressable
          onPress={() => selectedDay ? stepDay(-1) : setWeekOffset((p) => p - 1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={selectedDay ? "Previous day" : "Previous week"}
        >
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.navLabelBtn}
          accessibilityRole="button"
          accessibilityLabel="Open date picker"
        >
          <Text style={[styles.weekLabel, { color: colors.text }]}>
            {selectedDay ? dayViewLabel : weekLabel}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.textTertiary} />
        </Pressable>

        <Pressable
          onPress={() => selectedDay ? stepDay(1) : setWeekOffset((p) => p + 1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={selectedDay ? "Next day" : "Next week"}
        >
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
      </View>

      {/* Today button */}
      {(weekOffset !== 0 || selectedDay) && (
        <Pressable
          onPress={() => { setWeekOffset(0); setSelectedDay(null); }}
          style={[styles.todayBtn, { backgroundColor: colors.primary + "15" }]}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={[styles.todayBtnText, { color: colors.primary }]}>Today</Text>
        </Pressable>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <ErrorState message="Could not load calendar events." onRetry={refetch} />
      ) : selectedDay ? (
        /* ── Day View ── */
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          <Text style={[styles.dayViewTitle, { color: colors.text }]}>{dayViewLabel}</Text>
          {dayViewEvents.length === 0 ? (
            <View style={styles.emptyDay}>
              <Feather name="calendar" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyDayText, { color: colors.textSecondary }]}>Nothing scheduled</Text>
              <Pressable
                style={[styles.emptyDayAdd, { backgroundColor: colors.primary }]}
                onPress={() => setShowCreate(true)}
              >
                <Feather name="plus" size={16} color={colors.onPrimary} />
                <Text style={[styles.emptyDayAddText, { color: colors.onPrimary }]}>Add Event</Text>
              </Pressable>
            </View>
          ) : (
            dayViewEvents.map(renderEventCard)
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        /* ── Week View ── */
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {dayGroups.map((day) => {
            const isToday = isSameDay(day.date, new Date());
            return (
              <View key={day.label} style={styles.dayGroup}>
                <Pressable
                  style={({ pressed }) => [styles.dayHeader, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDay(day.date);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${day.label}`}
                >
                  <View style={[styles.dayDot, { backgroundColor: colors.border }, isToday && { backgroundColor: colors.primary }]} />
                  <Text style={[styles.dayLabel, { color: colors.textSecondary }, isToday && { color: colors.text }]}>{day.label}</Text>
                  {isToday && <Text style={[styles.todayBadge, { backgroundColor: colors.primary }]}>Today</Text>}
                  {day.events.length > 0 && (
                    <View style={[styles.eventCountBadge, { backgroundColor: colors.primary + "15" }]}>
                      <Text style={[styles.eventCountText, { color: colors.primary }]}>{day.events.length}</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={14} color={colors.textTertiary} style={{ marginLeft: "auto" }} />
                </Pressable>
                {day.events.length === 0 ? (
                  <Text style={[styles.noEvents, { color: colors.textTertiary }]}>Nothing scheduled</Text>
                ) : (
                  day.events.map(renderEventCard)
                )}
              </View>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowCreate(true)} accessibilityRole="button" accessibilityLabel="Add event">
        <Feather name="plus" size={24} color={colors.onPrimary} />
      </Pressable>

      <CreateEventModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ["calendarEvents"] });
        }}
      />

      <EventDetailModal
        visible={!!selectedEvent}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onSave={(evId, data) => updateEventMut.mutate({ evId, data })}
        isSaving={updateEventMut.isPending}
      />

      {/* Month Picker Modal */}
      <Modal visible={showPicker} animationType="fade" transparent onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            {/* Picker header */}
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => { const m = new Date(pickerMonth); m.setMonth(m.getMonth() - 1); setPickerMonth(m); }} hitSlop={8}>
                <Feather name="chevron-left" size={22} color={colors.text} />
              </Pressable>
              <Text style={[styles.pickerMonthLabel, { color: colors.text }]}>
                {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
              </Text>
              <Pressable onPress={() => { const m = new Date(pickerMonth); m.setMonth(m.getMonth() + 1); setPickerMonth(m); }} hitSlop={8}>
                <Feather name="chevron-right" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* Weekday labels */}
            <View style={styles.pickerWeekRow}>
              {WEEKDAY_SHORT.map((d) => (
                <Text key={d} style={[styles.pickerWeekDay, { color: colors.textTertiary }]}>{d}</Text>
              ))}
            </View>

            {/* Day grid */}
            <MonthGrid
              month={pickerMonth}
              selectedDay={selectedDay}
              weekStart={weekStart}
              colors={colors}
              onSelectDay={(date) => jumpToDate(date, true)}
              onSelectWeek={(date) => jumpToDate(date, false)}
            />

            {/* Footer */}
            <View style={styles.pickerFooter}>
              <Pressable
                style={[styles.pickerTodayBtn, { backgroundColor: colors.primary }]}
                onPress={() => jumpToDate(new Date(), false)}
              >
                <Text style={[styles.pickerTodayText, { color: colors.onPrimary }]}>Today</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MonthGrid({ month, selectedDay, weekStart, colors, onSelectDay, onSelectWeek }: {
  month: Date;
  selectedDay: Date | null;
  weekStart: Date;
  colors: any;
  onSelectDay: (d: Date) => void;
  onSelectWeek: (d: Date) => void;
}) {
  const today = new Date();
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  // Build 6-week grid
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      {weeks.map((week, wi) => {
        const firstRealDay = week.find((d) => d !== null);
        const isCurrentWeek = firstRealDay ? isSameDay(
          (() => { const s = new Date(firstRealDay); s.setDate(s.getDate() - s.getDay()); return s; })(),
          weekStart
        ) : false;

        return (
          <View key={wi} style={styles.pickerWeekRow}>
            {/* Week select button */}
            <Pressable
              style={[styles.pickerWeekBtn, isCurrentWeek && { backgroundColor: colors.primary + "20" }]}
              onPress={() => firstRealDay && onSelectWeek(firstRealDay)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Select this week"
            >
              <Feather name="minus" size={10} color={isCurrentWeek ? colors.primary : colors.textTertiary} />
            </Pressable>

            {week.map((d, di) => {
              const isToday = d ? isSameDay(d, today) : false;
              const isSelected = d && selectedDay ? isSameDay(d, selectedDay) : false;
              const inCurrentWeek = d ? isSameDay(
                (() => { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); return s; })(),
                weekStart
              ) : false;

              return (
                <Pressable
                  key={di}
                  style={[
                    styles.pickerDay,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: colors.primary },
                    !d && { opacity: 0 },
                  ]}
                  onPress={() => d && onSelectDay(d)}
                  disabled={!d}
                  accessibilityRole="button"
                  accessibilityLabel={d ? d.toLocaleDateString() : undefined}
                >
                  <Text style={[
                    styles.pickerDayText,
                    { color: inCurrentWeek ? colors.text : colors.textTertiary },
                    isSelected && { color: colors.onPrimary },
                    isToday && !isSelected && { color: colors.primary, fontFamily: "SpaceGrotesk_700Bold" },
                  ]}>
                    {d ? d.getDate() : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function CreateEventModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("other");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [duration, setDuration] = useState("30");
  const [linkType, setLinkType] = useState<"none" | "lead" | "contact">("none");
  const [linkId, setLinkId] = useState("");

  const EVENT_TYPE_COLORS: Record<string, string> = {
    demo: colors.statusNew,
    "follow-up": colors.warning,
    meeting: colors.info,
    email: colors.success,
    other: colors.textTertiary,
  };

  const { data: leads = [] } = useQuery({ queryKey: ["leads"], queryFn: () => api.getLeads() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => api.getContacts() });

  const createMut = useMutation({
    mutationFn: (data: any) => api.createCalendarEvent(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle(""); setDescription(""); setEventType("other"); setLinkType("none"); setLinkId("");
      onCreated();
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    const startTime = startDate.toISOString();
    const endTime = new Date(startDate.getTime() + Number(duration) * 60000).toISOString();
    createMut.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      startTime, endTime, eventType,
      leadId: linkType === "lead" && linkId ? Number(linkId) : undefined,
      contactId: linkType === "contact" && linkId ? Number(linkId) : undefined,
    });
  };

  const linkedItems = linkType === "lead" ? leads : linkType === "contact" ? contacts : [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.container, { backgroundColor: colors.background }]}>
        <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}>
            <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[modalStyles.headerTitle, { color: colors.text }]}>New Event</Text>
          <Pressable onPress={handleCreate} disabled={!title.trim() || createMut.isPending}>
            <Text style={[modalStyles.saveText, { color: colors.primary }, (!title.trim() || createMut.isPending) && { opacity: 0.4 }]}>
              {createMut.isPending ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
        <ScrollView style={modalStyles.form} contentContainerStyle={modalStyles.formContent}>
          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput style={[modalStyles.input, { backgroundColor: colors.surface, color: colors.text }]} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={colors.textTertiary} />
          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Type</Text>
          <View style={modalStyles.typeRow}>
            {EVENT_TYPES.map((t) => (
              <Pressable key={t} style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, eventType === t && { backgroundColor: EVENT_TYPE_COLORS[t], borderColor: EVENT_TYPE_COLORS[t] }]} onPress={() => setEventType(t)}>
                <Text style={[modalStyles.typeChipText, { color: colors.text }, eventType === t && { color: colors.onPrimary }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <FriendlyDateTimePicker label="Date & Time" value={startDate} onChange={setStartDate} />
          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Duration (minutes)</Text>
          <View style={modalStyles.typeRow}>
            {["15", "30", "60", "90"].map((d) => (
              <Pressable key={d} style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, duration === d && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setDuration(d)}>
                <Text style={[modalStyles.typeChipText, { color: colors.text }, duration === d && { color: colors.onPrimary }]}>{d}m</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput style={[modalStyles.input, { backgroundColor: colors.surface, color: colors.text, minHeight: 60 }]} value={description} onChangeText={setDescription} placeholder="Optional notes" placeholderTextColor={colors.textTertiary} multiline />
          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Link to</Text>
          <View style={modalStyles.typeRow}>
            {(["none", "lead", "contact"] as const).map((t) => (
              <Pressable key={t} style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, linkType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setLinkType(t); setLinkId(""); }}>
                <Text style={[modalStyles.typeChipText, { color: colors.text }, linkType === t && { color: colors.onPrimary }]}>{t === "none" ? "None" : t === "lead" ? "Lead" : "Contact"}</Text>
              </Pressable>
            ))}
          </View>
          {linkType !== "none" && linkedItems.length > 0 && (
            <ScrollView style={[modalStyles.pickerList, { backgroundColor: colors.surface }]} nestedScrollEnabled>
              {linkedItems.map((item: any) => (
                <Pressable key={item.id} style={[modalStyles.pickerItem, { borderBottomColor: colors.borderLight }, linkId === String(item.id) && { backgroundColor: colors.primary + "10" }]} onPress={() => setLinkId(String(item.id))}>
                  <Text style={[modalStyles.pickerName, { color: colors.text }, linkId === String(item.id) && { color: colors.primary }]}>{item.name}</Text>
                  {item.email && <Text style={[modalStyles.pickerSub, { color: colors.textSecondary }]}>{item.email}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Layout.screenPadding, paddingVertical: 16 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { fontSize: 16, fontFamily: "SpaceGrotesk_500Medium" },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Layout.screenPadding, paddingBottom: 8 },
  navLabelBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekLabel: { fontSize: 15, fontFamily: "SpaceGrotesk_600SemiBold" },
  todayBtn: { alignSelf: "center", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginBottom: 8 },
  todayBtnText: { fontSize: 13, fontFamily: "SpaceGrotesk_600SemiBold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Layout.screenPadding },
  dayViewTitle: { fontSize: 22, fontFamily: "SpaceGrotesk_700Bold", marginBottom: 20, marginTop: 4 },
  dayGroup: { marginBottom: Layout.sectionSpacing },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  todayBadge: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold", color: "#fff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  eventCountBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  eventCountText: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold" },
  noEvents: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", paddingLeft: 16 },
  emptyDay: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyDayText: { fontSize: 16, fontFamily: "SpaceGrotesk_500Medium" },
  emptyDayAdd: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Layout.inputRadius, marginTop: 8 },
  emptyDayAddText: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  eventCard: { flexDirection: "row", borderRadius: Layout.cardRadius, marginBottom: Layout.cardGap, overflow: "hidden" },
  eventStripe: { width: 4 },
  eventBody: { flex: 1, padding: Layout.cardPadding },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventTitle: { fontSize: 15, fontFamily: "SpaceGrotesk_600SemiBold", flex: 1, marginRight: 8 },
  eventTime: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium" },
  eventDesc: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", marginTop: 4 },
  eventMeta: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 11, fontFamily: "SpaceGrotesk_600SemiBold", textTransform: "capitalize" },
  linkBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium" },
  fab: {
    position: "absolute", bottom: 100, right: 20,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: Layout.fabElevation,
  },
  // Month picker
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
  pickerSheet: { borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  pickerMonthLabel: { fontSize: 17, fontFamily: "SpaceGrotesk_600SemiBold" },
  pickerWeekRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  pickerWeekDay: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: "SpaceGrotesk_600SemiBold" },
  pickerWeekBtn: { width: 24, justifyContent: "center", alignItems: "center", borderRadius: 4, paddingVertical: 4 },
  pickerDay: { flex: 1, aspectRatio: 1, justifyContent: "center", alignItems: "center", borderRadius: 20, margin: 1 },
  pickerDayText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium" },
  pickerFooter: { marginTop: 16, alignItems: "center" },
  pickerTodayBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Layout.inputRadius },
  pickerTodayText: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Layout.cardPadding, borderBottomWidth: 1 },
  cancelText: { fontSize: 16, fontFamily: "SpaceGrotesk_500Medium" },
  headerTitle: { fontSize: 17, fontFamily: "SpaceGrotesk_600SemiBold" },
  saveText: { fontSize: 16, fontFamily: "SpaceGrotesk_600SemiBold" },
  form: { flex: 1 },
  formContent: { padding: Layout.screenPadding, gap: 4 },
  label: { fontSize: 13, fontFamily: "SpaceGrotesk_600SemiBold", marginTop: 14, marginBottom: 8 },
  input: { borderRadius: Layout.inputRadius, padding: Layout.cardPadding, fontSize: 15, fontFamily: "SpaceGrotesk_400Regular" },
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", textTransform: "capitalize" },
  pickerList: { maxHeight: 200, borderRadius: Layout.inputRadius, marginTop: 8 },
  pickerItem: { padding: Layout.cardPadding, borderBottomWidth: 1 },
  pickerName: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium" },
  pickerSub: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
});
