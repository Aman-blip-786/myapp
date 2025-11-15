"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  const [projects, setProjects] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  

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

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <p>Logged in as: {userEmail}</p>

      <p className="text-blue-600">
        Backend says: <strong>{backendMessage}</strong>
      </p>

      {/* Projects */}
      <section className="border p-4 bg-white rounded shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Your Projects</h2>
        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul>
            {projects.map((p: any) => (
              <li key={p.id} className="p-2 border rounded mb-2">
                <strong>{p.title}</strong>
                <p>{p.scope}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Alerts */}
      <section className="border p-4 bg-white rounded shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Scope Creep Alerts</h2>
        {alerts.length === 0 ? (
          <p>No alerts.</p>
        ) : (
          <ul>
            {alerts.map((a: any) => (
              <li key={a.id} className="p-2 border rounded mb-2">
                {a.ai_summary}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending Approvals */}
      <section className="border p-4 bg-white rounded shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Pending Approvals</h2>
        {pendingApprovals.length === 0 ? (
          <p>No pending approvals.</p>
        ) : (
          <ul>
            {pendingApprovals.map((a: any) => (
              <li key={a.id} className="p-2 border rounded mb-2">
                {a.project_id} — {a.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

