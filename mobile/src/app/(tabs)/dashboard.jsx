import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getDashboardStats } from "../../api/dashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const d = await getDashboardStats();
      setData({
        totalApplications: d.stats?.totalApplications ?? 0,
        pendingCount: d.stats?.emailsPending ?? 0,
        interviewCount: d.stats?.interviewsScheduled ?? 0,
        offerCount: d.stats?.offers ?? 0,
        recentApplications: d.recentApplications ?? [],
        upcomingInterviews: d.upcomingInterviews ?? [],
        upcomingFollowUps: [...(d.followUpsDueToday ?? []), ...(d.overdueFollowUpsList ?? [])],
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const displayName = user?.name || user?.email?.split("@")[0] || "there";

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ height: 20, width: 180, backgroundColor: colors.border, borderRadius: 6 }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, height: 90, backgroundColor: colors.border, borderRadius: 12 }} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    { label: "Total Applications", value: data?.totalApplications ?? 0, color: "#2563eb" },
    { label: "Pending", value: data?.pendingCount ?? 0, color: "#d97706" },
    { label: "Interviews", value: data?.interviewCount ?? 0, color: "#7c3aed" },
    { label: "Offers", value: data?.offerCount ?? 0, color: "#059669" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
      >
        <View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Welcome back, {displayName}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 2 }}>{today}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[
            { label: "New application", href: "/applications/new" },
            { label: "LinkedIn capture", href: "/(tabs)/linkedin" },
            { label: "HR Reply", href: "/hr-reply" },
            { label: "Follow-ups", href: "/followups" },
            { label: "Emails", href: "/emails" },
          ].map((a) => (
            <TouchableOpacity
              key={a.href}
              onPress={() => router.push(a.href)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {stats.map((s) => (
            <TouchableOpacity
              key={s.label}
              onPress={() => {
                if (s.label.includes("Interview")) router.push("/interviews");
                else if (s.label.includes("Pending")) router.push("/emails");
                else router.push("/(tabs)/applications");
              }}
              style={{ flexBasis: "48%", flexGrow: 1, backgroundColor: s.color, borderRadius: 12, padding: 14 }}
            >
              <Text style={{ fontSize: 26, fontWeight: "700", color: "#fff" }}>{s.value}</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "600", color: colors.text }}>Recent Applications</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/applications")}>
              <Text style={{ color: colors.primary, fontSize: 12 }}>View all</Text>
            </TouchableOpacity>
          </View>
          {(data?.recentApplications?.length ?? 0) === 0 ? (
            <Text style={{ color: colors.textMuted, padding: 16, textAlign: "center" }}>No applications yet</Text>
          ) : (
            data.recentApplications.map((app) => (
              <TouchableOpacity
                key={app._id}
                onPress={() => router.push({ pathname: "/applications/[id]", params: { id: app._id } })}
                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: colors.text }}>{app.jobTitle || "Untitled"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{app.companyName || "—"}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{app.status}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontWeight: "600", color: colors.text, fontSize: 13 }}>Upcoming Interviews</Text>
            </View>
            {(data?.upcomingInterviews?.length ?? 0) === 0 ? (
              <Text style={{ color: colors.textMuted, padding: 12, fontSize: 12, textAlign: "center" }}>None scheduled</Text>
            ) : (
              data.upcomingInterviews.slice(0, 5).map((iv) => (
                <TouchableOpacity key={iv._id} onPress={() => router.push("/interviews")} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontWeight: "600", color: colors.text, fontSize: 12 }}>{iv.jobTitle || iv.application?.jobTitle || "Interview"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{iv.companyName || iv.application?.companyName || ""} · {iv.date ? new Date(iv.date).toLocaleDateString() : ""}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontWeight: "600", color: colors.text, fontSize: 13 }}>Follow-ups Due</Text>
            </View>
            {(data?.upcomingFollowUps?.length ?? 0) === 0 ? (
              <Text style={{ color: colors.textMuted, padding: 12, fontSize: 12, textAlign: "center" }}>All caught up</Text>
            ) : (
              data.upcomingFollowUps.slice(0, 5).map((f) => (
                <View key={f._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontWeight: "600", color: colors.text, fontSize: 12 }}>{f.jobTitle}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{f.companyName}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
