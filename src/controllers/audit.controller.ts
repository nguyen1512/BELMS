import { Request, Response } from "express";
import { db } from "../config/db";

export async function getAuditLogs(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        al.id,
        al.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        al.action,
        al.module,
        al.target_id,
        al.target_type,
        al.description,
        (al.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS created_at
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);

    return res.json({
      message: "Lấy lịch sử thao tác thành công",
      logs: result.rows,
    });
  } catch (error) {
    console.error("Get audit logs error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy lịch sử thao tác",
    });
  }
}