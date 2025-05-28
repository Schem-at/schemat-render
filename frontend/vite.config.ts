import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	define: {
		global: "globalThis",
	},
	build: {
		rollupOptions: {
			output: {
				globals: {
					three: "THREE", // Map to the global THREE from CDN
				},
			},
		},
	},
	optimizeDeps: {
		include: ["three"],
	},
});
