"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Check session and load user email
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
      } else {
        setUserEmail(data.session.user.email || "");
        setLoading(false);
      }
    });
  }, []);

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>

      <p className="text-gray-700 mb-6">
        Logged in as: <strong>{userEmail}</strong>
      </p>

      <div className="p-4 border rounded bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Your Projects</h2>
        <p className="text-gray-500">You don’t have any projects yet.</p>
      </div>
    </div>
  );
}

