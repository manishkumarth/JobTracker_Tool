import { Stack } from "expo-router";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FeatureDisabledModal from "../components/FeatureDisabledModal";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <FeatureDisabledModal />
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
