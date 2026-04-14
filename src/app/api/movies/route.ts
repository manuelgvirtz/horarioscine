import { NextRequest, NextResponse } from "next/server";
import { getMovies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const data = await getMovies(params);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching movies:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
