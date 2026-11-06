import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // NEXT_PUBLIC_* = nomes criados pela integração Supabase da Vercel.
  // Nunca adicionar "SUPABASE_" aqui: exporia a SUPABASE_SERVICE_ROLE_KEY ao navegador.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
  },
} as never);
