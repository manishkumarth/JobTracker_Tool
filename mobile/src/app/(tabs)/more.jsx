import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

const LINKS = [
  { label: "Companies", href: "/companies" },
  { label: "Contacts", href: "/contacts" },
  { label: "Emails", href: "/emails" },
  { label: "Templates", href: "/templates" },
  { label: "Follow-ups", href: "/followups" },
  { label: "Interviews", href: "/interviews" },
  { label: "AI Settings", href: "/ai-settings" },
];

export default function More() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>More</Text>
        {LINKS.map((l) => (
          <TouchableOpacity
            key={l.href}
            onPress={() => router.push(l.href)}
            style={{
              borderWidth: 1,
              borderColor: "#e5e7eb",
              borderRadius: 8,
              padding: 14,
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontWeight: "600", color: "#111827" }}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
