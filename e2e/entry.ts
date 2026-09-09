// Check before importing anything that opens a database or reads credentials.
if (process.env.NODE_ENV !== "test" || process.env.DB_PATH !== ":memory:") {
  throw new Error("Use the Playwright runner to start the isolated test server.");
}

await import("./server.js");

export {};
