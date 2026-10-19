import { useEffect } from "react";
import { Slot, router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function AuthLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)/dashboard");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Slot />;
}
