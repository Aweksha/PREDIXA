import fs from "fs";
import { pool } from "./postgresClient.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node src/db/runSql.js <path-to-sql>");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");

try {
  await pool.query(sql);
  console.log("SQL applied:", file);
} catch (e) {
  console.error("SQL failed:", e);
  process.exit(1);
} finally {
  await pool.end();
}
