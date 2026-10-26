import ListScreen from "../../components/ListScreen";
import { listContacts, deleteContact, createContact } from "../../api/contacts";

export default function Contacts() {
  return (
    <ListScreen
      title="Contacts"
      loadFn={listContacts}
      titleField="name"
      subtitleField="email"
      onDeleteFn={deleteContact}
      createFn={createContact}
      detailHref="/contacts"
      createFields={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "designation", label: "Title / Role" },
      ]}
    />
  );
}
