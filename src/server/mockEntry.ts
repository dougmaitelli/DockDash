// Development-only mock entry point — not included in production builds.
// Sets up an in-memory database and mock Docker service before starting the server.
import { logger } from "./lib/logService.js";
import { overrideDockerService } from "./services/dockerService.js";
import { setupMockDatabase } from "./services/mock/mockDatabaseService.js";
import { mockDockerService } from "./services/mock/mockDockerService.js";

setupMockDatabase();
overrideDockerService(mockDockerService);
logger.info("Mock mode enabled — in-memory database seeded, MockDockerService active");

await import("./index.js");
