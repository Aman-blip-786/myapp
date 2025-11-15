"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

interface Project {
  id: string;
  title: string;
  scope: string;
  user_id: string;
  created_at?: string;
}

interface Alert {
  id: string;
  ai_summary: string;
  created_at?: string;
}

interface Approval {
  id: string;
  project_id: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectScope, setNewProjectScope] = useState("");

  const [backendMessage, setBackendMessage] = useState("");

  // AUTH CHECK + LOAD DATA
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      setUserEmail(data.session.user.email || "");
      setUserId(data.session.user.id);

      // Load dashboard data
      loadDashboardData(data.session.user.id);

      // Test backend connection
      fetch("https://myapp-gw5z.onrender.com")
        .then((res) => res.text())
        .then((msg) => setBackendMessage(msg))
        .catch((err) => console.error("Backend error:", err));

      setLoading(false);
    }
    init();
  }, []);

  async function loadDashboardData(userId: string) {
    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const { data: alertsData } = await supabase
      .from("scope_creep_alerts")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: approvalsData } = await supabase
      .from("project_approvals")
      .select("*")
      .eq("status", "pending");

    setProjects(projectsData || []);
    setAlerts(alertsData || []);
    setPendingApprovals(approvalsData || []);
  }

  async function reloadProjects() {
    if (!userId) return;
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setProjects(data || []);
  }

  async function handleNewProject(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newProjectTitle || !newProjectScope) return;

    const { error } = await supabase
      .from("projects")
      .insert([{ title: newProjectTitle, scope: newProjectScope, user_id: userId }]);

    if (!error) {
      setNewProjectTitle("");
      setNewProjectScope("");
      reloadProjects();
    }
  }

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600 mb-1">Logged in as: {userEmail}</p>
        <p className="text-blue-600 text-sm">
          Backend says: <strong>{backendMessage}</strong>
        </p>
      </div>

      <section className="border border-gray-200 p-6 bg-white rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
        
        <form onSubmit={handleNewProject} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Project title"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              type="text"
              placeholder="Scope"
              value={newProjectScope}
              onChange={(e) => setNewProjectScope(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Add
            </button>
          </div>
        </form>

        {projects.length === 0 ? (
          <p className="text-gray-500">No projects yet.</p>
        ) : (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <strong className="text-lg">{p.title}</strong>
                <p className="text-gray-600 mt-1">{p.scope}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-gray-200 p-6 bg-white rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Scope Creep Alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-gray-500">No alerts.</p>
        ) : (
          <ul className="space-y-3">
            {alerts.map((a) => (
              <li key={a.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                {a.ai_summary}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-gray-200 p-6 bg-white rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Pending Approvals</h2>
        {pendingApprovals.length === 0 ? (
          <p className="text-gray-500">No pending approvals.</p>
        ) : (
          <ul className="space-y-3">
            {pendingApprovals.map((a) => (
              <li key={a.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                {a.project_id} — {a.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

