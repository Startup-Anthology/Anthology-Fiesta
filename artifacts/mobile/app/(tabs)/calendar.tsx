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
import FriendlyDateTimePicker from "@/components/FriendlyDateTimePicker";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const EVENT_TYPES = ["demo", "follow-up", "meeting", "other"];

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

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

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

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["calendarEvents", weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: () => api.getCalendarEvents({
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
    }),
  });

  const hasSynced = useRef(false);
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true;
      api.syncCalendar().then(() => refetch()).catch(() => {});
    }
  }, []);

  const handleRefresh = async () => {
    try {
      await api.syncCalendar();
    } catch {}
    refetch();
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const dayGroups = useMemo(() => {
    const days: { date: Date; label: string; events: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dayEvents = events.filter((e: any) => isSameDay(new Date(e.startTime), d));
      days.push({
        date: d,
        label: d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        events: dayEvents,
      });
    }
    return days;
  }, [events, weekStart]);

  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
        <HamburgerMenu />
      </View>

      <View style={styles.weekNav}>
        <Pressable onPress={() => setWeekOffset((p) => p - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous week">
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => setWeekOffset(0)} accessibilityRole="button" accessibilityLabel={`Current week: ${weekLabel}. Tap to return to today`}>
          <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel}</Text>
        </Pressable>
        <Pressable onPress={() => setWeekOffset((p) => p + 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next week">
          <Feather name="chevron-right" size={24} color={colors.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {dayGroups.map((day) => {
            const isToday = isSameDay(day.date, new Date());
            return (
              <View key={day.label} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <View style={[styles.dayDot, { backgroundColor: colors.border }, isToday && { backgroundColor: colors.primary }]} />
                  <Text style={[styles.dayLabel, { color: colors.textSecondary }, isToday && { color: colors.text }]}>{day.label}</Text>
                  {isToday && <Text style={[styles.todayBadge, { backgroundColor: colors.primary }]}>Today</Text>}
                </View>
                {day.events.length === 0 ? (
                  <Text style={[styles.noEvents, { color: colors.textTertiary }]}>Nothing scheduled</Text>
                ) : (
                  day.events.map((ev: any) => (
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
                        {ev.description ? <Text style={[styles.eventDesc, { color: colors.textSecondary }]} numberOfLines={1}>{ev.description}</Text> : null}
                        <View style={styles.eventMeta}>
                          <View style={[styles.typeBadge, { backgroundColor: (EVENT_TYPE_COLORS[ev.eventType] || colors.textTertiary) + "15" }]}>
                            <Text style={[styles.typeText, { color: EVENT_TYPE_COLORS[ev.eventType] || colors.textTertiary }]}>{ev.eventType}</Text>
                          </View>
                          {ev.leadId && (
                            <Pressable onPress={() => router.push({ pathname: "/lead/[id]", params: { id: String(ev.leadId) } })} style={styles.linkBadge} accessibilityRole="link" accessibilityLabel={`Open lead: ${ev.leadName || `Lead #${ev.leadId}`}`}>
                              <Feather name="target" size={12} color={colors.info} />
                              <Text style={[styles.linkText, { color: colors.info }]}>{ev.leadName || `Lead #${ev.leadId}`}</Text>
                            </Pressable>
                          )}
                          {ev.contactId && (
                            <Pressable onPress={() => router.push({ pathname: "/contact/[id]", params: { id: String(ev.contactId) } })} style={styles.linkBadge} accessibilityRole="link" accessibilityLabel={`Open contact: ${ev.contactName || `Contact #${ev.contactId}`}`}>
                              <Feather name="user" size={12} color={colors.info} />
                              <Text style={[styles.linkText, { color: colors.info }]}>{ev.contactName || `Contact #${ev.contactId}`}</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  ))
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
      setTitle("");
      setDescription("");
      setEventType("other");
      setLinkType("none");
      setLinkId("");
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
      startTime,
      endTime,
      eventType,
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
              <Pressable
                key={t}
                style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, eventType === t && { backgroundColor: EVENT_TYPE_COLORS[t], borderColor: EVENT_TYPE_COLORS[t] }]}
                onPress={() => setEventType(t)}
              >
                <Text style={[modalStyles.typeChipText, { color: colors.text }, eventType === t && { color: colors.onPrimary }]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <FriendlyDateTimePicker label="Date & Time" value={startDate} onChange={setStartDate} />

          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Duration (minutes)</Text>
          <View style={modalStyles.typeRow}>
            {["15", "30", "60", "90"].map((d) => (
              <Pressable
                key={d}
                style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, duration === d && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setDuration(d)}
              >
                <Text style={[modalStyles.typeChipText, { color: colors.text }, duration === d && { color: colors.onPrimary }]}>{d}m</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput style={[modalStyles.input, { backgroundColor: colors.surface, color: colors.text, minHeight: 60 }]} value={description} onChangeText={setDescription} placeholder="Optional notes" placeholderTextColor={colors.textTertiary} multiline />

          <Text style={[modalStyles.label, { color: colors.textSecondary }]}>Link to</Text>
          <View style={modalStyles.typeRow}>
            {(["none", "lead", "contact"] as const).map((t) => (
              <Pressable
                key={t}
                style={[modalStyles.typeChip, { borderColor: colors.border, backgroundColor: colors.surface }, linkType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => { setLinkType(t); setLinkId(""); }}
              >
                <Text style={[modalStyles.typeChipText, { color: colors.text }, linkType === t && { color: colors.onPrimary }]}>{t === "none" ? "None" : t === "lead" ? "Lead" : "Contact"}</Text>
              </Pressable>
            ))}
          </View>

          {linkType !== "none" && linkedItems.length > 0 && (
            <ScrollView style={[modalStyles.pickerList, { backgroundColor: colors.surface }]} nestedScrollEnabled>
              {linkedItems.map((item: any) => (
                <Pressable
                  key={item.id}
                  style={[modalStyles.pickerItem, { borderBottomColor: colors.borderLight }, linkId === String(item.id) && { backgroundColor: colors.primary + "10" }]}
                  onPress={() => setLinkId(String(item.id))}
                >
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
  title: { fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Layout.screenPadding, paddingBottom: 16 },
  weekLabel: { fontSize: 15, fontFamily: "SpaceGrotesk_600SemiBold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Layout.screenPadding },
  dayGroup: { marginBottom: Layout.sectionSpacing },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  todayBadge: { fontSize: 11, fontFamily: "SpaceGrotesk_700Bold", color: "#fff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  noEvents: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", paddingLeft: 16 },
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
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: Layout.fabElevation,
  },
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
