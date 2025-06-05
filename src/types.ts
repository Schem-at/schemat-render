export interface Window {
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
		startVideoRecording: (options?: {
				duration?: number;
				width?: number;
				height?: number;
				frameRate?: number;
			}) => Promise<Blob>;
	};
}


