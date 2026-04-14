import { NextRequest, NextResponse } from "next/server";
import { getCinemas } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const data = await getCinemas(params);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching cinemas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
