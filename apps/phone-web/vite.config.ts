import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Input Relay",
        short_name: "Input Relay",
        start_url: "/",
        display: "standalone",
        background_color: "#10100e",
        theme_color: "#10100e",
        icons: []
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 5174
  }
});
