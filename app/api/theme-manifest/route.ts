import type { MetadataRoute } from "next";
import {
  normalizeThemeId,
  themeAppColors,
} from "@/lib/themes";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const themeId = normalizeThemeId(url.searchParams.get("theme"));
  const colors = themeAppColors[themeId];
  const encodedTheme = encodeURIComponent(themeId);

  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name: "Has Gardaşlar Ligi",
    short_name: "Has Gardaşlar",
    description: "Has Gardaşlar futbol tahmin platformu",
    start_url: "/",
    display: "standalone",
    background_color: colors.backgroundColor,
    theme_color: colors.themeColor,
    icons: [
      {
        src: `/api/theme-icon?theme=${encodedTheme}&size=192`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/api/theme-icon?theme=${encodedTheme}&size=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/manifest+json",
    },
  });
}
