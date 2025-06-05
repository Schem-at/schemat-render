import puppeteer, { Browser, Page } from "puppeteer";
import { logger } from "../shared/logger.js";

let browser: Browser | null = null;
let pagePool: Page[] = [];
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
const MAX_PAGES = parseInt(process.env.MAX_CONCURRENT_RENDERS || "3");
const FRONTEND_URL = "http://localhost:3000";

// tell TypeScript that window.schematicRendererInitialized, THREE, and window.schematicHelpers are defined

export async function initPuppeteerService(): Promise<void> {
	// Return existing initialization if already in progress
	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = (async () => {
		try {
			logger.info("🚀 Launching Puppeteer browser...");

			browser = await puppeteer.launch({
				// @ts-ignore
				headless: "new", // Use the new headless mode for better performance
				timeout: 60_000,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
					"--disable-accelerated-2d-canvas",
					"--no-first-run",
					"--disable-audio-output",
					"--disable-background-timer-throttling",
					"--disable-backgrounding-occluded-windows",
					"--disable-renderer-backgrounding",
				],
			});

			logger.info("✅ Browser launched successfully");

			// Initialize the page pool
			await initializePagePool();

			isInitialized = true;
			logger.info("✅ Puppeteer service fully initialized");
		} catch (error: any) {
    console.error("Failed to initialize Puppeteer:");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Full error:", error);
    
    logger.error("Failed to initialize Puppeteer:", error.message || error);
    isInitialized = false;
    throw error;
}
	})();

	return initializationPromise;
}

/**
 * Initialize schematic rendering page pool
 */
async function initializePagePool(): Promise<void> {
	try {
		logger.info("Initializing page pool...");

		// Test if React app is accessible first
		try {
			const testPage = await browser!.newPage();
			await testPage.goto(FRONTEND_URL, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});

			// Check if the basic page loads
			const title = await testPage.title();
			logger.info(`✅ React app accessible, title: ${title}`);

			await testPage.close();
		} catch (error: any) {
			logger.error(
				`❌ React app not accessible at ${FRONTEND_URL}:`,
				error.message
			);
			throw new Error(
				`React app unavailable at ${FRONTEND_URL}. Make sure frontend is built and served.`
			);
		}

		// Create page pool with individual error handling
		let successCount = 0;
		for (let i = 0; i < MAX_PAGES; i++) {
			try {
				logger.info(`Creating page ${i + 1}/${MAX_PAGES}...`);
				const page = await createSchematicPage();
				pagePool.push(page);
				successCount++;
				logger.info(`✅ Created page ${i + 1}/${MAX_PAGES}`);
			} catch (error: any) {
				logger.error(`❌ Failed to create page ${i + 1}:`, error.message);
				// Continue trying to create more pages
			}
		}

		logger.info(
			`✅ Initialized page pool with ${successCount}/${MAX_PAGES} pages`
		);

		// Allow service to start even with partial success
		if (successCount === 0) {
			logger.warn(
				"⚠️ No pages initialized successfully - service will have degraded functionality"
			);
		}
	} catch (error: any) {
		logger.error("❌ Failed to initialize page pool:", error.message);
		throw error;
	}
}

/**
 * Create a new schematic rendering page (pre-initialized and ready)
 */
async function createSchematicPage(): Promise<Page> {
	const page = await browser!.newPage();

	// Enable logging for debugging
	page.on("console", (msg) => {
		const type = msg.type();
		const text = msg.text();
		logger.info(`BROWSER [${type.toUpperCase()}]: ${text}`);
	});

	page.on("error", (err) => logger.error("PAGE ERROR:", err));
	page.on("pageerror", (err) => logger.error("PAGE SCRIPT ERROR:", err));

	// Set viewport for rendering
	await page.setViewport({ width: 1920, height: 1080 });

	try {
		logger.info(`Loading React app: ${FRONTEND_URL}`);

		await page.goto(FRONTEND_URL, {
			waitUntil: "domcontentloaded",
			timeout: 30000,
		});

		logger.info("✅ React app loaded successfully");

		// Check if THREE is available
		const threeStatus = await page.evaluate(() => {
			return {
				hasThree: !!window.THREE,
				threeVersion: window.THREE?.REVISION || "not found",
			};
		});
		logger.info("THREE.js status:", threeStatus);

		logger.info("Waiting for schematic helpers to be available...");

		// Wait for the React app's global helpers to be ready
		await page.waitForFunction(
	() => {
		return (
			window.schematicHelpers &&
			typeof window.schematicHelpers.waitForReady === "function" &&
			typeof window.schematicHelpers.startVideoRecording === "function" && 
			typeof window.schematicHelpers.takeScreenshot === "function" &&
			typeof window.schematicHelpers.loadSchematic === "function"
		);
	},
	{
		timeout: 15000,
		polling: 500,
	}
);

		logger.info("✅ Schematic helpers found!");

		// Check current status before waiting
		const preWaitStatus = await page.evaluate(() => {
			return {
				hasHelpers: !!window.schematicHelpers,
				isReady: window.schematicHelpers?.isReady(),
				rendererInitialized: window.schematicRendererInitialized,
			};
		});
		logger.info("Pre-wait status:", preWaitStatus);

		if (preWaitStatus.isReady) {
			logger.info("✅ Renderer already ready, skipping wait");
		} else {
			logger.info("Waiting for renderer initialization...");

			// Wait for the renderer to be fully initialized with shorter timeout
			await page.evaluate(() => {
				return new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(
							new Error("Renderer initialization timeout after 10 seconds")
						);
					}, 10000); // Reduced timeout

					window.schematicHelpers
						.waitForReady()
						.then(() => {
							clearTimeout(timeout);
							resolve(true);
						})
						.catch(reject);
				});
			});
		}

		logger.info("✅ Schematic page ready and initialized");
		return page;
	} catch (error) {
		logger.error("❌ Schematic page initialization failed:", error);

		// Get detailed debug info
		try {
			const debugInfo = await page.evaluate(() => {
				return {
					url: window.location.href,
					hasThree: !!window.THREE,
					hasHelpers: !!window.schematicHelpers,
					rendererInitialized: window.schematicRendererInitialized,
					helpersKeys: window.schematicHelpers
						? Object.keys(window.schematicHelpers)
						: [],
					consoleErrors: window.console ? "Console available" : "No console",
				};
			});
			logger.info("Debug info:", debugInfo);
		} catch (debugError: any) {
			logger.info("Could not get debug info:", debugError.message);
		}

		await page.close();
		throw error;
	}
}

export function getBrowser(): Browser | null {
	return browser;
}

/**
 * Get a page from the pool (with readiness check)
 */
export async function getPage(): Promise<Page> {
	// Ensure Puppeteer is initialized
	if (!isInitialized || !browser) {
		throw new Error(
			"Puppeteer service not initialized. Please wait and try again."
		);
	}

	if (pagePool.length > 0) {
		return pagePool.pop()!;
	}

	// Create on-demand if pool is empty
	logger.info("Creating page on-demand...");
	return await createSchematicPage();
}

/**
 * Check if Puppeteer is ready
 */
export function isPuppeteerReady(): boolean {
	return isInitialized && browser !== null;
}

/**
 * Wait for Puppeteer to be ready
 */
export async function waitForPuppeteerReady(
	timeout: number = 30000
): Promise<void> {
	const startTime = Date.now();

	while (!isPuppeteerReady()) {
		if (Date.now() - startTime > timeout) {
			throw new Error("Puppeteer initialization timeout");
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/**
 * Return page to pool
 */
export async function releasePage(page: Page): Promise<void> {
	if (pagePool.length < MAX_PAGES) {
		pagePool.push(page);
	} else {
		await page.close();
	}
}

/**
 * Get page pool status
 */
export function getPagePoolStatus() {
	return {
		available: pagePool.length,
		total: MAX_PAGES,
		status: pagePool.length > 0 ? "ready" : "unavailable",
	};
}
