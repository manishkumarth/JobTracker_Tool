import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCompany } from "../../api/companies";
import { useTheme } from "../../context/ThemeContext";
import { STATUS_COLORS } from "../../constants";

export default function CompanyDetail() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await getCompany(id);
        setData(res);
      } catch (e) {
        setErr(e?.response?.data?.message || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (err || !data) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.danger, marginTop: 12 }}>{err || "Not found"}</Text>
      </SafeAreaView>
    );
  }

  const company = data.company || data;
  const contacts = data.contacts || [];
  const applications = data.applications || [];
  const emails = data.emails || [];
  const calls = data.calls || [];

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.card,
    gap: 6,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>← Back</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>{company.name}</Text>
        <Text style={{ color: colors.textMuted }}>
          {[company.industry, company.location, company.size].filter(Boolean).join(" · ") || "—"}
        </Text>
        {company.website ? (
          <TouchableOpacity onPress={() => Linking.openURL(company.website)}>
            <Text style={{ color: colors.primary }}>Website ↗</Text>
          </TouchableOpacity>
        ) : null}
        {company.notes ? (
          <View style={card}>
            <Text style={{ color: colors.text }}>{company.notes}</Text>
          </View>
        ) : null}

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Contacts ({contacts.length})</Text>
          {contacts.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>No contacts yet.</Text>
          ) : (
            contacts.map((c) => (
              <TouchableOpacity
                key={c._id}
                onPress={() => router.push(`/contacts/${c._id}`)}
                style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ fontWeight: "600", color: colors.text }}>{c.name || c.email}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {[c.contactType, c.email].filter(Boolean).join(" · ")}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Applications ({applications.length})</Text>
          {applications.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>No applications yet.</Text>
          ) : (
            applications.map((a) => {
              const sc = STATUS_COLORS[a.status] || colors.textMuted;
              return (
                <TouchableOpacity
                  key={a._id}
                  onPress={() => router.push(`/applications/${a._id}`)}
                  style={{
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: colors.text, flex: 1 }}>{a.jobTitle}</Text>
                  <Text style={{ color: sc, fontSize: 11, fontWeight: "600" }}>
                    {(a.status || "").replaceAll("_", " ")}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={card}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Recent emails</Text>
          {emails.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>None yet.</Text>
          ) : (
            emails.slice(0, 10).map((e) => (
              <View
                key={e._id}
                style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ color: colors.text }} numberOfLines={1}>
                  {e.subject || "(no subject)"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.status}</Text>
              </View>
            ))
          )}
        </View>

        {calls.length > 0 ? (
          <View style={card}>
            <Text style={{ fontWeight: "700", color: colors.text }}>Recent calls</Text>
            {calls.slice(0, 10).map((c) => (
              <View
                key={c._id}
                style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ color: colors.text }}>{c.notes || c.outcome || "Call"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {c.date ? new Date(c.date).toLocaleString() : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
