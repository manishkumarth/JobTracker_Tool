import ListScreen from "../../components/ListScreen";
import { listEmails } from "../../api/emails";

export default function Emails() {
  return (
    <ListScreen
      title="Emails"
      loadFn={listEmails}
      titleField="subject"
      subtitleField="recipientEmail"
    />
  );
}
