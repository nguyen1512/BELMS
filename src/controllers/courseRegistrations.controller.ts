import { Request, Response } from "express";
import { db } from "../config/db";

export async function getCourseRegistrations(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        cr.id,
        cr.user_id,
        cr.course_id,
        cr.request_type,
        cr.status,
        cr.note,
        cr.created_at,
        cr.updated_at,

        u.full_name,
        u.email,
        u.position,
        d.name AS department_name,

        c.title AS course_title,
        c.level AS course_level
      FROM course_registrations cr
      JOIN users u ON u.id = cr.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      JOIN courses c ON c.id = cr.course_id
      ORDER BY cr.created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách đăng ký khóa học thành công",
      registrations: result.rows,
    });
  } catch (error) {
    console.error("Get course registrations error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách đăng ký khóa học",
    });
  }
}

export async function createCourseRegistration(req: Request, res: Response) {
  try {
    const { user_id, course_id, request_type, note } = req.body;

    if (!user_id || !course_id) {
      return res.status(400).json({
        message: "Vui lòng chọn nhân sự và khóa học",
      });
    }

    const result = await db.query(
      `
      INSERT INTO course_registrations (
        user_id,
        course_id,
        request_type,
        status,
        note
      )
      VALUES ($1, $2, $3, 'pending', $4)
      ON CONFLICT (user_id, course_id)
      DO UPDATE SET
        request_type = EXCLUDED.request_type,
        status = 'pending',
        note = EXCLUDED.note,
        updated_at = now()
      RETURNING *
      `,
      [user_id, course_id, request_type || "optional", note || null]
    );

    return res.status(201).json({
      message: "Tạo yêu cầu đăng ký khóa học thành công",
      registration: result.rows[0],
    });
  } catch (error) {
    console.error("Create course registration error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo yêu cầu đăng ký",
    });
  }
}

export async function approveCourseRegistration(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const id = String(req.params.id || "");

    await client.query("BEGIN");

    const registrationResult = await client.query(
      `
      SELECT id, user_id, course_id, status
      FROM course_registrations
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    const registration = registrationResult.rows[0];

    await client.query(
      `
      UPDATE course_registrations
      SET status = 'approved',
          updated_at = now()
      WHERE id = $1
      `,
      [id]
    );

    await client.query(
      `
      INSERT INTO enrollments (
        user_id,
        course_id,
        progress_percent,
        status
      )
      VALUES ($1, $2, 0, 'learning')
      ON CONFLICT (user_id, course_id)
      DO NOTHING
      `,
      [registration.user_id, registration.course_id]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Duyệt đăng ký và ghi danh khóa học thành công",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Approve course registration error:", error);
    return res.status(500).json({
      message: "Lỗi server khi duyệt đăng ký",
    });
  } finally {
    client.release();
  }
}

export async function rejectCourseRegistration(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { note } = req.body;

    const result = await db.query(
      `
      UPDATE course_registrations
      SET status = 'rejected',
          note = COALESCE($2, note),
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [id, note || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    return res.json({
      message: "Từ chối đăng ký khóa học thành công",
      registration: result.rows[0],
    });
  } catch (error) {
    console.error("Reject course registration error:", error);
    return res.status(500).json({
      message: "Lỗi server khi từ chối đăng ký",
    });
  }
}