import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "me-budget",
    short_name: "me-budget",
    description: "จดรายรับรายจ่ายแบบกดเดียวจบ",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3f1",
    theme_color: "#29cc57",
    lang: "th",
    // Long-press the home-screen icon for the two most common starts
    shortcuts: [
      { name: "จดรายจ่าย", short_name: "จดรายจ่าย", url: "/new?mode=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "สแกนใบเสร็จ", short_name: "สแกน", url: "/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
