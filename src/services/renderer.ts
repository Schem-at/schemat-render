import { getPage, releasePage, waitForPuppeteerReady } from "./puppeteer.js";
import { RenderOptions } from "../shared/types.js";
import { logger } from "../shared/logger.js";

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

		// Load schematic (no waiting needed - page is pre-initialized)
		const loadSuccess = await page.evaluate(async (data) => {
			try {
				await window.schematicHelpers.loadSchematic("api-schematic", data);
				return true;
			} catch (error) {
				console.error("Failed to load schematic:", error.message || error);
				return false;
			}
		}, base64Data);

		if (!loadSuccess) {
			throw new Error("Failed to load schematic in renderer");
		}

		// Wait for rendering to complete
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Take screenshot
		const screenshotBlob = await page.evaluate(async (opts) => {
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
