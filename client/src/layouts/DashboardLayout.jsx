import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";

const pageNames = {
  "/dashboard": "Dashboard",
  "/applications": "Applications",
  "/companies": "Companies",
  "/contacts": "Contacts",
  "/emails": "Email History",
  "/templates": "Templates",
  "/followups": "Follow-ups",
  "/interviews": "Interviews",
  "/profile": "Candidate Profile",
};

export default function DashboardLayout() {
  const location = useLocation();
  const basePath = "/" + location.pathname.split("/")[1];
  const pageName = pageNames[basePath] || "Dashboard";

  return (
    <div className="min-h-screen lg:flex bg-primary">
      <Sidebar />
      <main className="flex-1 min-w-0">
        {/* Desktop top bar */}
        <div className="hidden lg:block sticky top-0 z-10 glass border-b border-color">
          <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">{pageName}</h2>
            <div className="h-px flex-1 mx-6 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
