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
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
