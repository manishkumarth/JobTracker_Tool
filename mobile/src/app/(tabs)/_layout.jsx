import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 4),
          paddingTop: 4,
          height: 56 + insets.bottom,
          backgroundColor: colors.tabBg,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = "grid-outline";
          if (route.name === "dashboard") iconName = "home-outline";
          if (route.name === "applications") iconName = "briefcase-outline";
          if (route.name === "profile") iconName = "person-outline";
          if (route.name === "linkedin") iconName = "logo-linkedin";
          if (route.name === "more") iconName = "menu-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="applications" options={{ title: "Jobs" }} />
      <Tabs.Screen name="linkedin" options={{ title: "LinkedIn" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
