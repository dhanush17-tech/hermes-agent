import { createDb, runMigrations } from "./db.js";

const { sqlite, filePath } = createDb();
runMigrations(sqlite);
console.log(`Migrated database at ${filePath}`);
