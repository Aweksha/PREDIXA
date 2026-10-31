import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./postgresClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

try {
  await pool.query(sql);
  console.log(" Schema applied");
} catch (e) {
  console.error(" Schema failed:", e);
  process.exit(1);
} finally {
  await pool.end();
}
