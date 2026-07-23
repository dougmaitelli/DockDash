import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource } from "@shared";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

let connMod: typeof import("@server/db/connection.js");
let connSqlite: { close(): void };

beforeEach(async () => {
  vi.resetModules();
  process.env.DB_PATH = ":memory:";
  connMod = await import("@server/db/connection.js");
  connSqlite = connMod.sqlite;
});

afterEach(() => {
  try {
    connSqlite.close();
  } catch {}
  delete process.env.DB_PATH;
});

describe("overrideConnection", () => {
  it("replaces the sqlite live binding", () => {
    const original = connMod.sqlite;
    const replacement = new Database(":memory:");

    try {
      connMod.overrideConnection(replacement);

      expect(connMod.sqlite).toBe(replacement);
      expect(connMod.sqlite).not.toBe(original);
    } finally {
      replacement.close();
    }
  });

  it("downstream ORM modules write to the replacement database", async () => {
    const replacement = new Database(":memory:");

    replacement.pragma("journal_mode = WAL");
    replacement.pragma("foreign_keys = ON");
    migrate(drizzle(replacement), { migrationsFolder: MIGRATIONS_FOLDER });

    try {
      connMod.overrideConnection(replacement);

      // serviceRepository is imported after the override so it binds to the updated orm
      const { serviceRepository } = await import("@server/db/serviceRepository.js");

      serviceRepository.saveService({
        name: "t",
        host: "h",
        ports: [],
        source: ServiceSource.NETWORK,
      });

      // Verify the write landed in `replacement`, not in the original in-memory DB
      const row = replacement.prepare("SELECT count(*) as n FROM services").get() as { n: number };

      expect(row.n).toBe(1);
    } finally {
      replacement.close();
    }
  });
});

describe("createSessionStore", () => {
  it("returns an object with the standard express-session Store interface", () => {
    const store = connMod.createSessionStore();

    expect(typeof store.get).toBe("function");
    expect(typeof store.set).toBe("function");
    expect(typeof store.destroy).toBe("function");
  });

  it("persists, reads, and destroys a session", async () => {
    const store = connMod.createSessionStore();
    const session = { cookie: { maxAge: 60_000 }, user: { id: "user-1" } };

    await new Promise<void>((resolve, reject) =>
      store.set("session-1", session as never, (error) => (error ? reject(error) : resolve())),
    );
    const stored = await new Promise<unknown>((resolve, reject) =>
      store.get("session-1", (error, value) => (error ? reject(error) : resolve(value))),
    );

    expect(stored).toMatchObject({ user: { id: "user-1" } });

    await new Promise<void>((resolve, reject) =>
      store.destroy("session-1", (error) => (error ? reject(error) : resolve())),
    );
    const removed = await new Promise<unknown>((resolve, reject) =>
      store.get("session-1", (error, value) => (error ? reject(error) : resolve(value))),
    );

    expect(removed).toBeNull();
  });
});

describe("connection lifecycle", () => {
  it("reports a healthy open database", () => {
    expect(connMod.isConnectionHealthy()).toBe(true);
  });

  it("closes an open connection and reports it as unhealthy", () => {
    connMod.closeConnection();

    expect(connMod.sqlite.open).toBe(false);
    expect(connMod.isConnectionHealthy()).toBe(false);
  });

  it("allows closeConnection to be called after the database is already closed", () => {
    connMod.sqlite.close();

    expect(() => connMod.closeConnection()).not.toThrow();
  });
});
