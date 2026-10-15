import { Outlet, useLocation, NavLink } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import DisabledBanner from "../components/DisabledBanner.jsx";
import HowItWorks from "../components/HowItWorks.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { isAdminUser } from "../constants.js";

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
  "/ai-settings": "Config",
  "/admin": "Admin",
};

export default function DashboardLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const basePath = "/" + location.pathname.split("/")[1];
  const pageName = pageNames[basePath] || "Dashboard";

  return (
    <div className="min-h-screen lg:flex bg-primary">
      <DisabledBanner />
      <Sidebar />
      <main className="flex-1 min-w-0">
        {/* Desktop top bar */}
        <div className="hidden lg:block sticky top-0 z-10 glass border-b border-color">
          <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-primary">{pageName}</h2>
            <div className="h-px flex-1 mx-6 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
            {isAdminUser(user) && (
              <NavLink to="/admin" className="btn btn-secondary btn-sm text-danger">
                Admin
              </NavLink>
            )}
            <HowItWorks />
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
