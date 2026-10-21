import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { isAdminUser } from "../../constants";

const LINKS = [
  { label: "Companies", href: "/companies", icon: "🏢" },
  { label: "Contacts", href: "/contacts", icon: "👤" },
  { label: "Email History", href: "/emails", icon: "✉️" },
  { label: "Email Templates", href: "/templates", icon: "📄" },
  { label: "Follow-ups", href: "/followups", icon: "🔄" },
  { label: "Interviews", href: "/interviews", icon: "🗓️" },
  { label: "Reply to HR", href: "/hr-reply", icon: "💬" },
  { label: "AI Settings", href: "/ai-settings", icon: "🤖" },
];

export default function More() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const links = [...LINKS];
  if (isAdminUser(user)) {
    links.push({ label: "Admin Access", href: "/admin", icon: "🛡️" });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 4 }}>
          More
        </Text>
        {user ? (
          <Text style={{ color: colors.textMuted, marginBottom: 8 }}>
            Signed in as {user.name || user.email}
            {user.gmailConnected ? " · Gmail connected" : ""}
          </Text>
        ) : null}

        {links.map((l) => (
          <TouchableOpacity
            key={l.href}
            onPress={() => router.push(l.href)}
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18 }}>{l.icon}</Text>
            <Text style={{ color: colors.text, fontWeight: "500", flex: 1 }}>{l.label}</Text>
            <Text style={{ color: colors.textMuted }}>›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={toggleTheme}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            padding: 14,
            marginTop: 8,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "500" }}>
            {isDark ? "☀️ Light mode" : "🌙 Dark mode"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await logout();
            router.replace("/auth/login");
          }}
          style={{
            borderWidth: 1,
            borderColor: colors.danger,
            borderRadius: 10,
            padding: 14,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: "600" }}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
