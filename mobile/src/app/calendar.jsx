import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { listFollowUps } from "../api/followups";
import { listInterviews } from "../api/interviews";
import { listEmails } from "../api/emails";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

export default function CalendarScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);

  const [followUps, setFollowUps] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [emails, setEmails] = useState([]);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr("");
    try {
      const [fuRes, ivRes, emRes] = await Promise.all([
        listFollowUps({ scope: "all" }),
        listInterviews({}),
        listEmails({ limit: 100 }),
      ]);
      setFollowUps(Array.isArray(fuRes) ? fuRes : fuRes.followups || fuRes.items || []);
      setInterviews(Array.isArray(ivRes) ? ivRes : []);
      const emailList = Array.isArray(emRes) ? emRes : emRes.emails || emRes.items || [];
      setEmails(emailList.filter((e) => e.status === "Sent"));
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  // Build a day -> items map for the upcoming window: today + next 30 days,
  // plus a "sent recently" window of the last 14 days.
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const upcomingWindowStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 2); // include yesterday just in case
    return d;
  }, [today]);
  const upcomingWindowEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    d.setHours(23, 59, 59);
    return d;
  }, [today]);
  const recentWindowStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 14);
    return d;
  }, [today]);

  const byDay = useMemo(() => {
    const map = new Map();
    const add = (dateStr, item, kind) => {
      if (!dateStr) return;
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr).push({ ...item, _kind: kind });
    };

    followUps.forEach((f) => {
      const due = f.date || f.dueDate;
      const d = new Date(due);
      if (Number.isNaN(d.getTime())) return;
      if (d >= upcomingWindowStart && d <= upcomingWindowEnd) {
        add(isoDay(d), f, "followup");
      } else if (f.status === "Completed" && d >= recentWindowStart && d <= today) {
        add(isoDay(d), f, "followup-done");
      }
    });

    interviews.forEach((iv) => {
      const d = new Date(iv.date);
      if (Number.isNaN(d.getTime())) return;
      if (d >= upcomingWindowStart && d <= upcomingWindowEnd) {
        add(isoDay(d), iv, "interview");
      }
    });

    emails.forEach((e) => {
      const d = new Date(e.sentAt || e.createdAt);
      if (Number.isNaN(d.getTime())) return;
      if (d >= recentWindowStart && d <= today) {
        add(isoDay(d), e, "email-sent");
      }
    });

    return map;
  }, [followUps, interviews, emails, upcomingWindowStart, upcomingWindowEnd, recentWindowStart, today]);

  const days = useMemo(() => {
    const arr = Array.from(byDay.entries()).map(([dateStr, items]) => ({ dateStr, items }));
    arr.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    // Today first, then future ascending, then recent past descending
    const todayStr = isoDay(today);
    arr.sort((a, b) => {
      const aPast = a.dateStr < todayStr;
      const bPast = b.dateStr < todayStr;
      if (aPast && !bPast) return 1;
      if (!aPast && bPast) return -1;
      if (aPast && bPast) return b.dateStr.localeCompare(a.dateStr); // newer past first
      return a.dateStr.localeCompare(b.dateStr);
    });
    return arr;
  }, [byDay, today]);

  const countByKind = (items) => {
    const c = { followup: 0, interview: 0, email: 0, done: 0 };
    items.forEach((it) => {
      if (it._kind === "followup") c.followup++;
      else if (it._kind === "interview") c.interview++;
      else if (it._kind === "email-sent") c.email++;
      else if (it._kind === "followup-done") c.done++;
    });
    return c;
  };

  const kindLabel = (k) => {
    if (k === "followup") return "Follow-up";
    if (k === "interview") return "Interview";
    if (k === "email-sent") return "Email sent";
    if (k === "followup-done") return "Follow-up done";
    return k;
  };
  const kindColor = (k) => {
    if (k === "followup") return "#d97706";
    if (k === "interview") return "#2563eb";
    if (k === "email-sent") return "#059669";
    if (k === "followup-done") return "#6b7280";
    return colors.textMuted;
  };

  const openDay = (dateStr, items) => {
    setSelectedDay({ dateStr, items });
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const totalUpcoming = days.reduce((s, d) => s + d.items.filter((i) => i._kind === "followup" || i._kind === "interview").length, 0);
  const totalSent = days.reduce((s, d) => s + d.items.filter((i) => i._kind === "email-sent" || i._kind === "followup-done").length, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Follow-up Calendar</Text>
          <TouchableOpacity onPress={() => load(true)}>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 12,
            marginHorizontal: 4,
          }}
        >
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Upcoming follow-ups + interviews</Text>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{totalUpcoming}</Text>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Sent / completed (last 14 days)</Text>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{totalSent}</Text>
          </View>
        </View>

        {err ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{err}</Text> : null}

        <FlatList
          data={days}
          keyExtractor={(item) => item.dateStr}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
          }
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const d = new Date(item.dateStr + "T00:00:00");
            const isToday = item.dateStr === isoDay(today);
            const c = countByKind(item.items);
            const total = item.items.length;
            const header = (
              <TouchableOpacity
                onPress={() => openDay(item.dateStr, item.items)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isToday ? colors.primary + "18" : colors.card,
                  borderWidth: 1,
                  borderColor: isToday ? colors.primary : colors.border,
                }}
              >
                <View>
                  <Text style={{ fontWeight: "700", color: colors.text, fontSize: 14 }}>
                    {fmtDate(d)} {isToday ? "· Today" : ""}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {DAY_LABELS[d.getDay()]}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {c.followup ? (
                    <View
                      style={{
                        backgroundColor: "#d9770622",
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: "#d97706",
                      }}
                    >
                      <Text style={{ color: "#d97706", fontSize: 11, fontWeight: "600" }}>
                        {c.followup} follow-up
                      </Text>
                    </View>
                  ) : null}
                  {c.interview ? (
                    <View
                      style={{
                        backgroundColor: "#2563eb22",
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: "#2563eb",
                      }}
                    >
                      <Text style={{ color: "#2563eb", fontSize: 11, fontWeight: "600" }}>
                        {c.interview} interview
                      </Text>
                    </View>
                  ) : null}
                  {c.email ? (
                    <View
                      style={{
                        backgroundColor: "#05966922",
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: "#059669",
                      }}
                    >
                      <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600" }}>
                        {c.email} email sent
                      </Text>
                    </View>
                  ) : null}
                  {c.done ? (
                    <View
                      style={{
                        backgroundColor: "#6b728022",
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: "#6b7280",
                      }}
                    >
                      <Text style={{ color: "#6b7280", fontSize: 11, fontWeight: "600" }}>
                        {c.done} done
                      </Text>
                    </View>
                  ) : null}
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>▾ {total}</Text>
                </View>
              </TouchableOpacity>
            );
            return (
              <View style={{ borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                {header}
                {selectedDay && selectedDay.dateStr === item.dateStr ? (
                  <View style={{ padding: 12, backgroundColor: colors.bg }}>
                    {item.items.map((it) => {
                      const appName =
                        (it.application && typeof it.application === "object"
                          ? it.application.jobTitle || it.application.companyName || "Application"
                          : it.application || "") ||
                        (it.recipient ? `to ${it.recipient}` : "") ||
                        "Item";
                      return (
                        <View
                          key={it._id}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            padding: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: "#e5e7eb",
                          }}
                        >
                          <View>
                            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                              {kindLabel(it._kind)}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                              {appName}{it._kind === "interview" && it.round ? ` · ${it.round}` : ""}
                            </Text>
                            {it.date ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmtTime(it.date)}</Text> : null}
                            {it.note ? <Text style={{ color: colors.text, fontSize: 12 }}>{it.note}</Text> : null}
                          </View>
                          <Text style={{ color: kindColor(it._kind), fontSize: 11, fontWeight: "600" }}>
                            {it._kind === "followup" || it._kind === "followup-done"
                              ? it.status || ""
                              : it.result || it.status || ""}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: "center", padding: 30 }}>
              No follow-ups, interviews or sent emails in this range.
            </Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}
