import { createElement } from "react";
import { ImageResponse } from "next/og";
import { getThemeById, normalizeThemeId } from "@/lib/themes";

const supportedSizes = new Set([180, 192, 512]);

function getIconSize(value: string | null) {
  const requestedSize = Number(value);
  return supportedSizes.has(requestedSize) ? requestedSize : 192;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const themeId = normalizeThemeId(url.searchParams.get("theme"));
  const theme = getThemeById(themeId);
  const size = getIconSize(url.searchParams.get("size"));
  const emblemUrl = new URL(theme.emblem, request.url).toString();

  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          overflow: "hidden",
          backgroundColor: "#07080a",
        },
      },
      createElement("img", {
        src: emblemUrl,
        alt: "",
        width: size,
        height: size,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top",
        },
      })
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }
  );
}
