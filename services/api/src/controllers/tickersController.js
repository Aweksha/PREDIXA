import { pool } from "../db/postgresClient.js";

function toLimit(x, fallback = 12) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(25, Math.max(1, Math.trunc(n)));
}

export const searchTickers = async (req, res) => {
  const q = (req.query.q || "").toString().trim().toUpperCase();
  const limit = toLimit(req.query.limit, 12);

  try {
    const result = await pool.query(
      `
      with universe as (
        select distinct symbol from securities
        union
        select distinct symbol from price_eod
      )
      select
        symbol,
        symbol as name
      from universe
      where ($1 = '' or symbol ilike '%' || $1 || '%')
      order by
        case
          when symbol = $1 then 0
          when symbol ilike $1 || '%' then 1
          else 2
        end,
        symbol asc
      limit $2
      `,
      [q, limit]
    );

    return res.json({
      query: q,
      results: result.rows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
      })),
    });
  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      detail: String(e),
    });
  }
};