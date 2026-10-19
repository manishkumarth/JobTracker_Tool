import ListScreen from "../../components/ListScreen";
import { listTemplates, deleteTemplate, createTemplate } from "../../api/templates";

export default function Templates() {
  return (
    <ListScreen
      title="Templates"
      loadFn={listTemplates}
      titleField="name"
      subtitleField="subject"
      onDeleteFn={deleteTemplate}
      createFn={createTemplate}
      createFields={[
        { key: "name", label: "Template Name" },
        { key: "subject", label: "Subject" },
        { key: "body", label: "Body", multiline: true },
      ]}
    />
  );
}
