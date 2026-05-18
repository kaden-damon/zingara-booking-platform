import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Royal Countess Zingara",
    short_name: "Zingara",
    description: "Luxury dinner show booking and venue operations.",
    start_url: "/book",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["entertainment", "food", "business"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Book Experience",
        short_name: "Book",
        description: "Open Zingara booking.",
        url: "/book",
      },
      {
        name: "Admin Portal",
        short_name: "Admin",
        description: "Open the Zingara admin portal.",
        url: "/admin",
      },
    ],
  };
}
