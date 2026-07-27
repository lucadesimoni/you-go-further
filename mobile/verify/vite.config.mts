import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "react-native": fileURLToPath(new URL("../node_modules/react-native-web", import.meta.url)),
      "@react-native-async-storage/async-storage": fileURLToPath(new URL("./stub-storage.ts", import.meta.url)),
    },
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js"],
  },
  define: { __DEV__: "true", "process.env.NODE_ENV": '"development"' },
  server: { port: 5199 },
});
