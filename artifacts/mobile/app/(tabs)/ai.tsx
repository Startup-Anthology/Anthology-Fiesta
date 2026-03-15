import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

type ViewState = "chat" | "history";

export default function AIChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [viewState, setViewState] = useState<ViewState>("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [hasLoadedGreeting, setHasLoadedGreeting] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: conversations = [], refetch: refetchConversations } = useQuery({
    queryKey: ["aiConversations"],
    queryFn: api.getAiConversations,
  });

  const { data: greetingData } = useQuery({
    queryKey: ["aiOnboarding"],
    queryFn: api.getOnboardingGreeting,
  });

  useEffect(() => {
    if (greetingData?.isNewUser && greetingData.greeting && !hasLoadedGreeting && chatMessages.length === 0 && !conversationId) {
      setChatMessages([{
        id: "greeting",
        role: "assistant",
        content: greetingData.greeting,
      }]);
      setHasLoadedGreeting(true);
    }
  }, [greetingData, hasLoadedGreeting, chatMessages.length, conversationId]);

  const loadConversation = useCallback(async (convId: number) => {
    try {
      const msgs = await api.getAiMessages(convId);
      setChatMessages(msgs.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
      })));
      setConversationId(convId);
      setViewState("chat");
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }, []);

  const startNewChat = useCallback(() => {
    setChatMessages([]);
    setConversationId(null);
    setViewState("chat");
    setHasLoadedGreeting(false);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setInputText("");
    setIsSending(true);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setChatMessages(prev => [...prev, userMsg, assistantMsg]);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const result = await api.sendChatSync(text, conversationId);

      setChatMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: result.content, isStreaming: false }
            : m
        )
      );

      if (result.conversationId && !conversationId) {
        setConversationId(result.conversationId);
      }

      refetchConversations();
    } catch (err: any) {
      console.error("AI chat error:", err?.message || err);
      setChatMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: "Sorry, something went wrong. Please try again.", isStreaming: false }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, conversationId, refetchConversations]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <View style={[
        styles.messageBubble,
        isUser ? [styles.userBubble, { backgroundColor: colors.primary }]
               : [styles.assistantBubble, { backgroundColor: colors.surface }],
      ]}>
        {!isUser && (
          <View style={styles.agentLabel}>
            <View style={[styles.agentDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.agentName, { color: colors.accent }]}>Coach</Text>
          </View>
        )}
        <Text style={[
          styles.messageText,
          { color: isUser ? colors.onPrimary : colors.text },
        ]}>
          {item.content}
          {item.isStreaming && !item.content && (
            <Text style={{ color: colors.textTertiary }}>Thinking...</Text>
          )}
        </Text>
        {item.isStreaming && (
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}
      </View>
    );
  }, [colors]);

  if (viewState === "history") {
    return (
      <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setViewState("chat")} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Back to chat">
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Past Conversations</Text>
          <Pressable onPress={startNewChat} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="New conversation">
            <Feather name="plus" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <FlatList
          data={conversations}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={styles.historyList}
          renderItem={({ item }: { item: any }) => (
            <Pressable
              style={({ pressed }) => [
                styles.historyItem,
                { backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
              onPress={() => loadConversation(item.id)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityHint="Double tap to open this conversation"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.historyDate, { color: colors.textTertiary }]}>
                  {new Date(item.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No conversations yet. Start chatting with Coach!</Text>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? (insets.bottom + 49) : 20}
    >
      <View style={styles.header}>
        <Pressable onPress={() => { refetchConversations(); setViewState("history"); }} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="View conversation history">
          <Feather name="clock" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.coachAvatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.coachAvatarText}>C</Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Coach</Text>
        </View>
        <Pressable onPress={startNewChat} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="New conversation">
          <Feather name="edit" size={20} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={renderMessage}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accent + "15" }]}>
              <Feather name="message-circle" size={32} color={colors.accent} />
            </View>
            <Text style={[styles.emptyChatTitle, { color: colors.text }]}>Talk to Coach</Text>
            <Text style={[styles.emptyChatSub, { color: colors.textSecondary }]}>
              Ask about your pipeline, contacts, follow-ups, or anything about the app.
            </Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          placeholder="Message Coach..."
          placeholderTextColor={colors.textTertiary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
          returnKeyType="default"
          editable={!isSending}
          accessibilityLabel="Message to Coach"
        />
        <Pressable
          onPress={sendMessage}
          style={[
            styles.sendBtn,
            { backgroundColor: inputText.trim() && !isSending ? colors.accent : colors.border },
          ]}
          disabled={!inputText.trim() || isSending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !inputText.trim() || isSending }}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="arrow-up" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
      <View style={{ height: insets.bottom + (Platform.OS === "web" ? 84 : 50) }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    gap: 12,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  coachAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  coachAvatarText: { fontSize: 14, fontFamily: "Lato_700Bold", color: "#fff" },
  headerTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold" },
  messageList: { padding: Layout.screenPadding, paddingBottom: 20, flexGrow: 1 },
  messageBubble: { borderRadius: 16, padding: 14, marginBottom: 10, maxWidth: "85%" },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  agentLabel: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  agentName: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold" },
  messageText: { fontSize: 15, fontFamily: "SpaceGrotesk_400Regular", lineHeight: 22 },
  streamingIndicator: { marginTop: 8 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "SpaceGrotesk_400Regular",
    maxHeight: 100,
    minHeight: 40,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  historyList: { padding: Layout.screenPadding },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: 8,
    gap: 12,
  },
  historyTitle: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold" },
  historyDate: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  pressed: { opacity: 0.7 },
  emptyText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center", padding: 40 },
  emptyChat: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  emptyChatTitle: { fontSize: 20, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 8 },
  emptyChatSub: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center", lineHeight: 20 },
});
