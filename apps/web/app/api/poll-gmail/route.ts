import { NextResponse } from "next/server";

export async function GET() {
  try {
    const backendUrl = process.env.BACKEND_BASE_URL;

    if (!backendUrl) {
      console.error("https://xiugigejmvdpgaqhdxdl.supabase.co/functions/v1/quick-endpoint");
      return NextResponse.json({ error: "https://xiugigejmvdpgaqhdxdl.supabase.co/functions/v1/quick-endpoint" }, { status: 500 });
    }

    const res = await fetch(`${backendUrl}/trigger-gmail-poll`, {
      method: "POST",
    });

    const data = await res.json();
    return NextResponse.json({
      message: "Cron triggered successfully",
      backend_response: data,
    });
  } catch (error) {
    console.error("Cron trigger error:", error);
    return NextResponse.json({ error: "Cron trigger failed" }, { status: 500 });
  }
}

