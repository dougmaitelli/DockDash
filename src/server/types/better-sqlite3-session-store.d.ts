declare module "better-sqlite3-session-store" {
  import type Database from "better-sqlite3";
  import type session from "express-session";

  interface SqliteStoreOptions {
    client: Database.Database;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  }

  function factory(s: typeof session): new (options: SqliteStoreOptions) => session.Store;

  export default factory;
}
