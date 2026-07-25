import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Has Gardaşlar Ligi",
    short_name: "Has Gardaşlar",
    description: "Has Gardaşlar futbol tahmin platformu",
    start_url: "/",
    display: "standalone",
    background_color: "#07080a",
    theme_color: "#d8a94d",
    icons: [
      {
        src: "/api/theme-icon?theme=obsidyen&size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/theme-icon?theme=obsidyen&size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
