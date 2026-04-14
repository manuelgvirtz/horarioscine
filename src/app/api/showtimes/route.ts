import { NextRequest, NextResponse } from "next/server";
import { getShowtimes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const data = await getShowtimes(params);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching showtimes:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
