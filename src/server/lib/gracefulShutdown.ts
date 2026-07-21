import type { Server } from "http";

import type { BackgroundJob } from "../jobs/BackgroundJob.js";
import { logger } from "./logService.js";

interface GracefulShutdownOptions {
  server: Server;
  jobs: BackgroundJob[];
  startupTasks?: Promise<unknown>[];
  closeActiveResources: () => void;
  closeDatabase: () => void;
  timeoutMs?: number;
}

export function createGracefulShutdown({
  server,
  jobs,
  startupTasks = [],
  closeActiveResources,
  closeDatabase,
  timeoutMs = 10_000,
}: GracefulShutdownOptions): (reason: string) => Promise<void> {
  let shutdown: Promise<void> | undefined;

  return (reason: string) => {
    if (shutdown) return shutdown;

    shutdown = (async () => {
      logger.info(`[Shutdown] ${reason} received; stopping server`);

      const jobStops = jobs.map((job) => job.stop());

      try {
        closeActiveResources();
      } catch (error) {
        logger.error("[Shutdown] Failed to close active resources:", error);
      }

      const serverClosed = new Promise<void>((resolve) => {
        server.close((error) => {
          if (error) logger.error("[Shutdown] HTTP server close failed:", error);

          resolve();
        });
        server.closeIdleConnections?.();
      });
      const drained = Promise.allSettled([...jobStops, ...startupTasks, serverClosed]);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timedOut = await Promise.race([
        drained.then(() => false),
        new Promise<true>((resolve) => {
          timeout = setTimeout(() => resolve(true), timeoutMs);
        }),
      ]);

      if (timeout) clearTimeout(timeout);

      if (timedOut) {
        logger.warn(`[Shutdown] Grace period of ${timeoutMs}ms expired; closing connections`);
        server.closeAllConnections?.();
      }

      closeDatabase();
      logger.info("[Shutdown] Complete");
    })().catch((error) => {
      logger.error("[Shutdown] Failed:", error);
      process.exitCode = 1;

      try {
        closeDatabase();
      } catch (closeError) {
        logger.error("[Shutdown] Database close failed:", closeError);
      }
    });

    return shutdown;
  };
}
