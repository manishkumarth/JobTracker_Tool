import ListScreen from "../../components/ListScreen";
import { listCompanies, deleteCompany, createCompany } from "../../api/companies";

export default function Companies() {
  return (
    <ListScreen
      title="Companies"
      loadFn={listCompanies}
      titleField="name"
      subtitleField="industry"
      onDeleteFn={deleteCompany}
      createFn={createCompany}
      createFields={[
        { key: "name", label: "Company Name" },
        { key: "industry", label: "Industry" },
        { key: "website", label: "Website" },
      ]}
    />
  );
}
