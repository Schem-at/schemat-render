import { Router } from "express";
import multer from "multer";
import { renderSchematic } from "../../services/renderer.js";
import { logger } from "../../shared/logger.js";

const router = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 100 * 1024 * 1024, // 100MB
	},
});

router.post(
	"/render-schematic",
	upload.single("schematic"),
	async (req, res) => {
		try {
			if (!req.file) {
				return res.status(400).json({ error: "Schematic file is required" });
			}

			logger.info(
				`Received schematic: ${req.file.originalname}, size: ${req.file.size} bytes`
			);

			const options = {
				width: parseInt(req.body.width) || 1920,
				height: parseInt(req.body.height) || 1080,
				format: req.body.format || "image/png",
				...JSON.parse(req.body.options || "{}"),
			};

			const pngBuffer = await renderSchematic(req.file.buffer, options);

			const filename = `${req.file.originalname.replace(/\.[^/.]+$/, "")}.png`;
			res.set("Content-Type", "image/png");
			res.set("Content-Disposition", `attachment; filename="${filename}"`);
			res.send(pngBuffer);
		} catch (error) {
			logger.error("Schematic render error:", error);
			res
				.status(500)
				.json({ error: error.message || "Failed to render schematic" });
		}
	}
);

export { router as renderRouter };
