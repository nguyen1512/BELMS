import { Request, Response } from "express";
import { db } from "../config/db";

export async function getEnrollments(
  req: Request,
  res: Response
) {
  try {
    const result = await db.query(`
      SELECT
        e.id,
        e.progress_percent,
        e.status,
        e.enrolled_at,

        u.id as user_id,
        u.full_name,
        u.email,

        c.id as course_id,
        c.title as course_title,
        c.level

      FROM enrollments e

      JOIN users u
        ON u.id = e.user_id

      JOIN courses c
        ON c.id = e.course_id

      ORDER BY e.enrolled_at DESC
    `);

    return res.json({
      message: "Lấy danh sách ghi danh thành công",
      enrollments: result.rows,
    });
  } catch (error) {
    console.error("Get enrollments error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách ghi danh",
    });
  }
}

export async function createEnrollment(
  req: Request,
  res: Response
) {
  try {
    const {
      user_id,
      course_id,
    } = req.body;

    const result = await db.query(
      `
      INSERT INTO enrollments (
        user_id,
        course_id
      )
      VALUES ($1, $2)
      RETURNING *
      `,
      [user_id, course_id]
    );

    return res.status(201).json({
      message: "Ghi danh khóa học thành công",
      enrollment: result.rows[0],
    });
  } catch (error) {
    console.error("Create enrollment error:", error);

    return res.status(500).json({
      message: "Lỗi server khi ghi danh khóa học",
    });
  }
}