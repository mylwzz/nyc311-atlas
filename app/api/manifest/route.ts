import { NextResponse } from "next/server";

import manifestJson from "@/manifest.json";
import { parseManifest } from "@/lib/artifacts/contract";

export const dynamic = "force-static";

export function GET() {
  const manifest = parseManifest(manifestJson);
  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
