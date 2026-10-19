import ListScreen from "../../components/ListScreen";
import { listFollowUps, deleteFollowUp, completeFollowUp } from "../../api/followups";
import { View, Text, TouchableOpacity, Alert } from "react-native";

export default function FollowUps() {
  return (
    <ListScreen
      title="Follow-ups"
      loadFn={listFollowUps}
      titleField="type"
      subtitleField="note"
      onDeleteFn={deleteFollowUp}
      renderItem={({ item }) => (
        <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, gap: 4 }}>
          <Text style={{ fontWeight: "600" }}>{item.type || "Follow-up"}</Text>
          <Text style={{ color: "#6b7280", fontSize: 12 }}>Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "-"}</Text>
          {item.note ? <Text style={{ color: "#374151" }}>{item.note}</Text> : null}
          <Text style={{ color: "#374151", fontSize: 12 }}>Status: {item.status}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            {item.status !== "COMPLETED" ? (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await completeFollowUp(item._id);
                    Alert.alert("Done", "Follow-up completed");
                  } catch (e) {
                    Alert.alert("Error", e.message);
                  }
                }}
              >
                <Text style={{ color: "#059669" }}>Complete</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => deleteFollowUp(item._id)}>
              <Text style={{ color: "#dc2626" }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}
