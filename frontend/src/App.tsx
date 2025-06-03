import "./App.css";
import { SchematicRenderer } from "schematic-renderer";
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
(window as any).THREE = THREE;

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

// TypeScript declarations for global helpers
declare global {
	interface Window {
		schematicHelpers?: {
			// Made optional
			loadSchematic: (
				name: string,
				data: string | ArrayBuffer
			) => Promise<void>;
			takeScreenshot: (options?: any) => Promise<Blob>;
			isReady: () => boolean;
			waitForReady: () => Promise<boolean>;
			clearScene: () => Promise<void>;
		};
		schematicRendererInitialized?: boolean; // Made optional
	}
}

export function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<SchematicRenderer | null>(null);
	const [status, setStatus] = useState<"initializing" | "ready" | "error">(
		"initializing"
	);
	const [currentSchematic, setCurrentSchematic] = useState<string>("none");

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			if (!canvasRef.current) return;

			try {
				console.log("Initializing SchematicRenderer...");
				setStatus("initializing");

				// Check if pack.zip is accessible
				try {
					const packResponse = await fetch("/pack.zip");
					if (!packResponse.ok) {
						throw new Error(`pack.zip not found: ${packResponse.status}`);
					}
					console.log("✅ pack.zip is accessible");
				} catch (packError: any) {
					console.error("❌ pack.zip check failed:", packError);
					throw new Error(`Missing pack.zip file: ${packError.message}`);
				}

				const renderer = new SchematicRenderer(
					canvasRef.current,
					{},
					{
						vanillaPack: async () => {
							console.log("Loading pack.zip...");
							const response = await fetch("/pack.zip");
							if (!response.ok) {
								throw new Error(`Failed to load pack.zip: ${response.status}`);
							}
							const buffer = await response.arrayBuffer();
							console.log("✅ pack.zip loaded, size:", buffer.byteLength);
							return new Blob([buffer], { type: "application/zip" });
						},
					},
					{
						enableDragAndDrop: true,
						callbacks: {
							onRendererInitialized: async (
								rendererInstance: SchematicRenderer
							) => {
								if (!mounted) return;

								console.log("✅ SchematicRenderer initialized successfully");
								rendererRef.current = rendererInstance;
								setStatus("ready");

								window.schematicRendererInitialized = true;
							},
						},
					}
				);

				rendererRef.current = renderer;
			} catch (error) {
				console.error("❌ Failed to initialize SchematicRenderer:", error);
				setStatus("error");
				window.schematicRendererInitialized = false;
			}
		};

		// Expose global helper functions for Puppeteer
		window.schematicHelpers = {
			// Around line 104-120, replace the loadSchematic function:
			loadSchematic: async (
				name: string,
				data: string | ArrayBuffer
			): Promise<void> => {
				if (!rendererRef.current?.schematicManager) {
					throw new Error("Renderer not initialized");
				}

				console.log(`Loading schematic: ${name}`);

				const buffer =
					typeof data === "string" ? base64ToArrayBuffer(data) : data;

				return new Promise((resolve, reject) => {
					try {
						// Clear any existing schematic first
						try {
							if (rendererRef.current?.schematicManager) {
								rendererRef.current.schematicManager.removeAllSchematics();
							}
						} catch (clearError) {
							console.warn(
								"Failed to clear existing schematics, continuing:",
								clearError
							);
						}

						// Load new schematic
						if (rendererRef.current?.schematicManager) {
							rendererRef.current.schematicManager.loadSchematic(
								name,
								buffer,
								{}
							);
						}

						requestAnimationFrame(() => {
							setTimeout(() => {
								setCurrentSchematic(name);
								console.log(`✅ Schematic loaded: ${name}`);
								resolve();
							}, 200);
						});
					} catch (error) {
						console.error(`❌ Failed to load schematic: ${error}`);
						reject(error);
					}
				});
			},

			takeScreenshot: async (options = {}): Promise<Blob> => {
				if (!rendererRef.current?.cameraManager?.recordingManager) {
					throw new Error("Recording manager not available");
				}

				console.log("Taking screenshot with options:", options);

				const defaultOptions = {
					width: 1920,
					height: 1080,
					format: "image/png" as const,
					quality: 0.9,
				};

				const screenshotOptions = { ...defaultOptions, ...options };

				try {
					const blob =
						await rendererRef.current.cameraManager.recordingManager.takeScreenshot(
							screenshotOptions
						);
					console.log("✅ Screenshot taken successfully");
					return blob;
				} catch (error) {
					console.error("❌ Screenshot failed:", error);
					throw error;
				}
			},

			clearScene: async (): Promise<void> => {
				if (!rendererRef.current?.schematicManager) {
					throw new Error("Renderer not initialized");
				}

				console.log("Clearing scene...");
				try {
					rendererRef.current.schematicManager.removeAllSchematics();
					setCurrentSchematic("none");
				} catch (error) {
					console.warn("Clear scene failed, continuing anyway:", error);
				}

				return new Promise((resolve) => {
					requestAnimationFrame(() => {
						setTimeout(resolve, 100);
					});
				});
			},

			isReady: (): boolean => {
				return !!(rendererRef.current && window.schematicRendererInitialized);
			},

			waitForReady: (): Promise<boolean> => {
				console.log("waitForReady called");
				return new Promise((resolve) => {
					const check = () => {
						const ready = window.schematicHelpers?.isReady();
						console.log("waitForReady check:", ready);
						if (ready) {
							console.log("waitForReady resolving!");
							resolve(true);
						} else {
							setTimeout(check, 100);
						}
					};
					check();
				});
			},
		};

		init();

		return () => {
			mounted = false;

			if (rendererRef.current) {
				console.log("Disposing renderer...");
				rendererRef.current.dispose?.();
				rendererRef.current = null;
			}

			// Clean up global helpers - now safe to delete
			if (window.schematicHelpers) {
				delete window.schematicHelpers;
			}
			window.schematicRendererInitialized = false;
		};
	}, []);

	// Status indicator component
	const StatusIndicator = () => {
		const getStatusColor = () => {
			switch (status) {
				case "initializing":
					return "bg-yellow-500";
				case "ready":
					return "bg-green-500";
				case "error":
					return "bg-red-500";
				default:
					return "bg-gray-500";
			}
		};

		const getStatusText = () => {
			switch (status) {
				case "initializing":
					return "Initializing...";
				case "ready":
					return "Ready";
				case "error":
					return "Error";
				default:
					return "Unknown";
			}
		};

		return (
			<div className="absolute top-4 left-4 flex items-center space-x-2 bg-black bg-opacity-50 px-3 py-2 rounded-lg text-white text-sm">
				<div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
				<span>Status: {getStatusText()}</span>
				{status === "ready" && (
					<span className="text-gray-300">| Schematic: {currentSchematic}</span>
				)}
			</div>
		);
	};

	return (
		<div className="bg-gray-900 h-screen w-screen flex items-center justify-center relative overflow-hidden">
			<StatusIndicator />

			{import.meta.env.DEV && (
				<div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white p-4 rounded-lg text-xs max-w-xs">
					<h3 className="font-bold mb-2">Puppeteer API Ready</h3>
					<div className="space-y-1">
						<div>• window.schematicHelpers.loadSchematic(name, data)</div>
						<div>• window.schematicHelpers.takeScreenshot(options)</div>
						<div>• window.schematicHelpers.isReady()</div>
						<div>• window.schematicHelpers.waitForReady()</div>
					</div>
				</div>
			)}

			{status === "error" && (
				<div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50">
					<div className="bg-red-800 text-white p-6 rounded-lg text-center">
						<h2 className="text-xl font-bold mb-2">Initialization Failed</h2>
						<p>Check console for details</p>
					</div>
				</div>
			)}

			<canvas
				ref={canvasRef}
				id="canvas"
				width={1920}
				height={1080}
				className="max-w-full max-h-full object-contain"
				style={{
					display: status === "error" ? "none" : "block",
					background: "transparent",
				}}
			/>

			{status === "initializing" && (
				<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="text-white text-center">
						<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
						<p>Initializing Schematic Renderer...</p>
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
