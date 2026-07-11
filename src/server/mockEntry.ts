// Development-only mock entry point — not included in production builds.
// Sets up an in-memory database and mock Docker service before starting the server.
import { overrideDatabase } from "./db/databaseService.js";
import { logger } from "./lib/logService.js";
import { overrideDockerService } from "./services/dockerService.js";
import { MockDatabaseService } from "./services/mockDatabaseService.js";
import { mockDockerService } from "./services/mockDockerService.js";

const mockDb = new MockDatabaseService();

mockDb.seed();
overrideDatabase(mockDb);
overrideDockerService(mockDockerService);
logger.info("Mock mode enabled — in-memory database seeded, MockDockerService active");

await import("./index.js");
