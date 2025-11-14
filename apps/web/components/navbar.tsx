"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export default function Navbar() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <nav className="w-full flex justify-between items-center p-4 border-b">
      <Link href="/" className="text-xl font-bold">
        myapp
      </Link>

      <div className="flex gap-4">
        <Link href="/dashboard" className="hover:underline">
          Dashboard
        </Link>

        <button
          onClick={logout}
          className="px-3 py-1 bg-red-600 text-white rounded"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
