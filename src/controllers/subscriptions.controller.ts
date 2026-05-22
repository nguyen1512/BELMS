import { Request, Response } from "express";
import { db } from "../config/db";

export async function getSubscriptions(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        ts.id,
        ts.name,
        ts.department_id,
        ts.budget_amount,
        ts.max_learners,
        ts.start_date,
        ts.end_date,
        ts.status,
        ts.note,
        ts.created_at,
        ts.updated_at,
        d.name AS department_name
      FROM training_subscriptions ts
      LEFT JOIN departments d ON d.id = ts.department_id
      ORDER BY ts.created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách subscription thành công",
      subscriptions: result.rows,
    });
  } catch (error) {
    console.error("Get subscriptions error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách subscription",
    });
  }
}

export async function createSubscription(req: Request, res: Response) {
  try {
    const {
      name,
      department_id,
      budget_amount,
      max_learners,
      start_date,
      end_date,
      status,
      note,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Vui lòng nhập tên gói subscription",
      });
    }

    const result = await db.query(
      `
      INSERT INTO training_subscriptions (
        name,
        department_id,
        budget_amount,
        max_learners,
        start_date,
        end_date,
        status,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        name,
        department_id || null,
        budget_amount || 0,
        max_learners || 0,
        start_date || null,
        end_date || null,
        status || "pending",
        note || null,
      ]
    );

    return res.status(201).json({
      message: "Tạo subscription thành công",
      subscription: result.rows[0],
    });
  } catch (error) {
    console.error("Create subscription error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo subscription",
    });
  }
}

export async function approveSubscription(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const result = await db.query(
      `
      UPDATE training_subscriptions
      SET status = 'active',
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy subscription",
      });
    }

    return res.json({
      message: "Duyệt subscription thành công",
      subscription: result.rows[0],
    });
  } catch (error) {
    console.error("Approve subscription error:", error);
    return res.status(500).json({
      message: "Lỗi server khi duyệt subscription",
    });
  }
}

export async function rejectSubscription(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const result = await db.query(
      `
      UPDATE training_subscriptions
      SET status = 'rejected',
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy subscription",
      });
    }

    return res.json({
      message: "Từ chối subscription thành công",
      subscription: result.rows[0],
    });
  } catch (error) {
    console.error("Reject subscription error:", error);
    return res.status(500).json({
      message: "Lỗi server khi từ chối subscription",
    });
  }
}