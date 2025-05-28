import { Express } from "express";
import { renderRouter } from "./render.js";
import { isPuppeteerReady } from "../../services/puppeteer.js";
import { logger } from "../../shared/logger.js";

export function setupRoutes(app: Express): void {
	// Health check endpoint
	app.get("/health", (req, res) => {
		res.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			version: "1.0.0",
			services: {
				puppeteer: isPuppeteerReady() ? "ready" : "initializing",
			},
		});
	});

	// API routes
	app.use("/api", renderRouter);

	// API base endpoint
	app.get("/api", (req, res) => {
		res.json({
			message: "Schemat Render Service API",
			version: "1.0.0",
			endpoints: ["GET /health", "POST /api/render-schematic"],
			status: {
				puppeteer: isPuppeteerReady() ? "ready" : "initializing",
			},
		});
	});

	logger.info("✅ Routes configured");
}
