import { Pool, QueryResult, QueryResultRow } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Please check your .env file.");
  throw new Error("DATABASE_URL is missing");
}

const globalForPg = global as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },

    // Không mở quá nhiều kết nối tới Neon
    max: 10,

    // Đóng connection nhàn rỗi sau 30s
    idleTimeoutMillis: 30000,

    // Chờ kết nối tối đa 20s
    connectionTimeoutMillis: 20000,

    // Giữ connection ổn định hơn
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

// Export db để các controller dùng được: import { db } from "../config/db";
export const db = pool;

// Hàm query dùng chung
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

// Hàm test kết nối DB cho server.ts
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    console.log(
      "Database connected successfully:",
      result.rows[0].current_time
    );

    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error);
});