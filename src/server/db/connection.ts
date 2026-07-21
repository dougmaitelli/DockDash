import Database from "better-sqlite3";
import SqliteStoreFactory from "better-sqlite3-session-store";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import session from "express-session";
import path from "path";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function openDb(): Database.Database {
  const db = new Database(process.env.DB_PATH || path.join(process.cwd(), "dockdash.db"));

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export let sqlite = openDb();
export let orm = drizzle(sqlite);

migrate(orm, { migrationsFolder: MIGRATIONS_FOLDER });

export function overrideConnection(newSqlite: Database.Database): void {
  sqlite = newSqlite;
  orm = drizzle(newSqlite);
}

export function createSessionStore(): session.Store {
  const SqliteStore = SqliteStoreFactory(session);

  return new SqliteStore({ client: sqlite });
}

export function closeConnection(): void {
  if (sqlite.open) sqlite.close();
}

export function isConnectionHealthy(): boolean {
  try {
    sqlite.prepare("SELECT 1").get();

    return true;
  } catch {
    return false;
  }
}
