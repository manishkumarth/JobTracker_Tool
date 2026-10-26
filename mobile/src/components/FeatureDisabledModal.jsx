import { Modal, View, Text, TouchableOpacity, Linking } from "react-native";
import { useEffect, useState } from "react";
import { onFeatureDisabled } from "../utils/featureEvents";
import { useTheme } from "../context/ThemeContext";

const FEATURE_LABELS = {
  sendEmail: "Sending emails",
  aiEmail: "AI email generation",
  autoFollowUp: "Auto follow-ups",
  resumeUpload: "Resume upload",
  quickFill: "LinkedIn Quick Fill",
};

export default function FeatureDisabledModal() {
  const { colors } = useTheme();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    return onFeatureDisabled((detail) => setInfo(detail || {}));
  }, []);

  if (!info) return null;

  const label = FEATURE_LABELS[info.feature];
  const title = info.disabled ? "Account Disabled" : "Feature Disabled";
  const body = info.disabled
    ? info.message || "Your account has been disabled. Please contact support."
    : `${label ? `"${label}"` : "This feature"} has been turned off on your account. Contact support to enable it.`;

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" }}>{title}</Text>
          <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>{body}</Text>
          <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textMuted }}>CONTACT SUPPORT</Text>
            <Text style={{ color: colors.text }}>Manish Kumar</Text>
            <TouchableOpacity onPress={() => Linking.openURL("tel:9798293519")}>
              <Text style={{ color: colors.primary }}>9798293519</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL("mailto:manish12099@gmail.com")}>
              <Text style={{ color: colors.primary }}>manish12099@gmail.com</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setInfo(null)}
            style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
