import { getPage, releasePage, waitForPuppeteerReady } from "./puppeteer.js";
import { RenderOptions } from "../shared/types.js";
import { logger } from "../shared/logger.js";

declare global {
	interface Window {
		schematicRendererInitialized: boolean;
		THREE: any;
		schematicHelpers: {
			waitForReady: () => Promise<void>;
			isReady: () => boolean;
			loadSchematic: (id: string, data: string) => Promise<void>;
			takeScreenshot: (options: {
				width: number;
				height: number;
				format: "image/png" | "image/jpeg";
			}) => Promise<Blob>;
		};
	}
}

export async function renderSchematic(
	schematicData: Buffer,
	options: RenderOptions = {}
): Promise<Buffer> {
	let page = null;

	try {
		// Wait for Puppeteer to be ready
		await waitForPuppeteerReady();

		page = await getPage(); // Page is already ready!

		logger.info(`Rendering schematic, size: ${schematicData.length} bytes`);

		// Convert buffer to base64 for easier transmission
		const base64Data = schematicData.toString("base64");

		// Setup event listener BEFORE loading schematic and wait for completion
		logger.info("Waiting for schematic render to complete...");
		const renderData: any = await page.evaluate(async (data) => {
			// Setup event listener FIRST
			const renderPromise = new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error("Schematic render timeout after 30 seconds"));
				}, 30000);

				window.addEventListener(
					"schematicRenderComplete",
					(event: any) => {
						clearTimeout(timeout);
						console.log("🎉 Puppeteer caught render complete event:", event.detail);
						resolve(event.detail);
					},
					{ once: true }
				);
			});

			// THEN load schematic (will trigger the event)
			try {
				await window.schematicHelpers.loadSchematic("api-schematic", data);
				console.log("✅ Schematic loading initiated");
			} catch (error: any) {
				console.error("Failed to load schematic:", error.message || error);
				throw error;
			}

			// Wait for the render complete event
			return renderPromise;
		}, base64Data);

		logger.info(
			`Schematic rendered successfully: ${renderData.meshCount} meshes in ${renderData.buildTimeMs}ms`
		);

		// Take screenshot
		const screenshotBlob = await page.evaluate(async (opts) => {
			if (window.schematicHelpers == undefined) {
				throw new Error("Schematic helpers not initialized");
			}
			console.log("Taking screenshot with options:", JSON.stringify(opts, null, 2));
			
			const blob = await window.schematicHelpers.takeScreenshot({
				width: opts.width || 1920,
				height: opts.height || 1080,
				format: opts.format || "image/png",
			});

			const arrayBuffer = await blob.arrayBuffer();
			return Array.from(new Uint8Array(arrayBuffer));
		}, options);

		return Buffer.from(screenshotBlob);
	} catch (error) {
		logger.error("Error in renderSchematic:", error);
		throw error;
	} finally {
		if (page) await releasePage(page);
	}
}