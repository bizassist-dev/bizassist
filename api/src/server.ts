// BizAssist_api
// path: src/server.ts

import type { Server } from "http";
import { app } from "@/app";
import { env } from "@/core/config/env";
import { prisma } from "@/lib/prisma";
import { startRealtimePostgresBridge, stopRealtimePostgresBridge } from "@/modules/realtime/realtime.postgres";
import { attachRealtimeServer } from "@/modules/realtime/realtime.server";

const PORT = env.port;

const color = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	magenta: "\x1b[35m",
	blue: "\x1b[34m",
	red: "\x1b[31m",
};

function printServerBanner() {
	const line = `${color.cyan}============================================================${color.reset}`;
	const basePath = "/api/v1";

	// Only show localhost hint in dev; it’s misleading on Render.
	const localHint =
		env.nodeEnv === "development" ? `http://localhost:${PORT}${basePath}` : "(not applicable in production)";

	// eslint-disable-next-line no-console
	console.log("");
	// eslint-disable-next-line no-console
	console.log(line);
	// eslint-disable-next-line no-console
	console.log(`${color.green} 200${color.reset}  BizAssist API Server is running`);
	// eslint-disable-next-line no-console
	console.log(line);
	// eslint-disable-next-line no-console
	console.log(`${color.yellow} Environment  :${color.reset} ${env.nodeEnv}`);
	// eslint-disable-next-line no-console
	console.log(`${color.blue} API Base URL :${color.reset} ${basePath}`);
	// eslint-disable-next-line no-console
	console.log(`${color.blue} Local Hint   :${color.reset} ${localHint}`);
	// eslint-disable-next-line no-console
	console.log(`${color.magenta} CORS Origin  :${color.reset} ${env.corsOrigin}`);
	// eslint-disable-next-line no-console
	console.log(line);
	// eslint-disable-next-line no-console
	console.log("");
}

// ---- graceful shutdown (critical for Prisma + HTTP server) ----
let isShuttingDown = false;
let server: Server | null = null;

async function shutdown(signal: string, err?: unknown) {
	if (isShuttingDown) return;
	isShuttingDown = true;

	// eslint-disable-next-line no-console
	console.log(`\n${color.yellow}Received ${signal}. Shutting down...${color.reset}`);
	if (err) {
		// eslint-disable-next-line no-console
		console.error(`${color.red}Shutdown reason:${color.reset}`, err);
	}

	try {
		if (server) {
			await new Promise<void>((resolve) => {
				server!.close(() => resolve());
			});
			// eslint-disable-next-line no-console
			console.log(`${color.green}HTTP server closed cleanly.${color.reset}`);
		}
	} catch (closeErr) {
		// eslint-disable-next-line no-console
		console.error(`${color.red}Error during HTTP server close:${color.reset}`, closeErr);
	}

	try {
		await stopRealtimePostgresBridge();
		// eslint-disable-next-line no-console
		console.log(`${color.green}Realtime bridge stopped cleanly.${color.reset}`);
	} catch (realtimeErr) {
		// eslint-disable-next-line no-console
		console.error(`${color.red}Error during realtime bridge shutdown:${color.reset}`, realtimeErr);
	}

	try {
		await prisma.$disconnect();
		// eslint-disable-next-line no-console
		console.log(`${color.green}Prisma disconnected cleanly.${color.reset}`);
	} catch (dbErr) {
		// eslint-disable-next-line no-console
		console.error(`${color.red}Error during Prisma disconnect:${color.reset}`, dbErr);
	} finally {
		// Exit fast once we’ve attempted cleanup.
		process.exit(0);
	}
}

// IMPORTANT: bind to 0.0.0.0 so Render (and devices) can reach it
server = app.listen(PORT, "0.0.0.0", printServerBanner);
attachRealtimeServer(server);
startRealtimePostgresBridge();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
	// eslint-disable-next-line no-console
	console.error("Uncaught Exception:", err);
	shutdown("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
	// eslint-disable-next-line no-console
	console.error("Unhandled Rejection:", reason);
	shutdown("unhandledRejection", reason);
});
