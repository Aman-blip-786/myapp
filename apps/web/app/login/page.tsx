"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function LoginPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [email, setEmail] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const sendOtp = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) setMessage(error.message);
    else {
      setOtpMode(true);
      setMessage("Check your email for the 6-digit code.");
    }
  };

  const verifyOtp = async () => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) setMessage(error.message);
    else window.location.href = "/dashboard";
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-80 flex flex-col gap-4">
        <h1 className="text-xl font-bold">Login</h1>

        {!otpMode ? (
          <>
            <input
              type="email"
              className="border p-2 rounded"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button onClick={sendOtp} className="bg-blue-600 text-white p-2 rounded">
              Send OTP
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              className="border p-2 rounded"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button onClick={verifyOtp} className="bg-green-600 text-white p-2 rounded">
              Verify OTP
            </button>
          </>
        )}

        {message && <p className="text-sm">{message}</p>}
      </div>
    </div>
  );
}

