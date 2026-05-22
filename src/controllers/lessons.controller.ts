import { Request, Response } from "express";
import { db } from "../config/db";

export async function getLessonsByCourse(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId || "");

    const result = await db.query(
      `
      SELECT
        id,
        course_id,
        title,
        description,
        content_type,
        content_url,
        duration_minutes,
        sort_order,
        status,
        resource_id,
        quiz_id,
        created_at
      FROM lessons
      WHERE course_id = $1
      ORDER BY sort_order ASC, created_at ASC
      `,
      [courseId]
    );

    return res.json({
      message: "Lấy danh sách bài học thành công",
      lessons: result.rows,
    });
  } catch (error) {
    console.error("Get lessons error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy bài học",
    });
  }
}

export async function createLesson(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId || "");

    const {
      title,
      description,
      content_type,
      content_url,
      duration_minutes,
      sort_order,
      status,
    } = req.body;

    if (!courseId) {
      return res.status(400).json({ message: "Thiếu ID khóa học" });
    }

    if (!title) {
      return res.status(400).json({ message: "Vui lòng nhập tên bài học" });
    }

    const result = await db.query(
      `
      INSERT INTO lessons (
        course_id,
        title,
        description,
        content_type,
        content_url,
        duration_minutes,
        sort_order,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        course_id,
        title,
        description,
        content_type,
        content_url,
        duration_minutes,
        sort_order,
        status,
        created_at
      `,
      [
        courseId,
        title,
        description || null,
        content_type || "video",
        content_url || null,
        duration_minutes || 0,
        sort_order || 1,
        status || "draft",
      ]
    );

    return res.status(201).json({
      message: "Tạo bài học thành công",
      lesson: result.rows[0],
    });
  } catch (error) {
    console.error("Create lesson error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo bài học",
    });
  }
}

export async function updateLesson(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const {
      title,
      description,
      content_type,
      content_url,
      duration_minutes,
      sort_order,
      status,
    } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Thiếu ID bài học" });
    }

    if (!title) {
      return res.status(400).json({ message: "Vui lòng nhập tên bài học" });
    }

    const result = await db.query(
      `
      UPDATE lessons
      SET
        title = $1,
        description = $2,
        content_type = $3,
        content_url = $4,
        duration_minutes = $5,
        sort_order = $6,
        status = $7,
        updated_at = now()
      WHERE id = $8
      RETURNING
        id,
        course_id,
        title,
        description,
        content_type,
        content_url,
        duration_minutes,
        sort_order,
        status,
        created_at
      `,
      [
        title,
        description || null,
        content_type || "video",
        content_url || null,
        duration_minutes || 0,
        sort_order || 1,
        status || "draft",
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    return res.json({
      message: "Cập nhật bài học thành công",
      lesson: result.rows[0],
    });
  } catch (error) {
    console.error("Update lesson error:", error);
    return res.status(500).json({
      message: "Lỗi server khi cập nhật bài học",
    });
  }
}

export async function deleteLesson(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    if (!id) {
      return res.status(400).json({ message: "Thiếu ID bài học" });
    }

    const result = await db.query(
      `
      DELETE FROM lessons
      WHERE id = $1
      RETURNING id, title
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    return res.json({
      message: "Xóa bài học thành công",
      lesson: result.rows[0],
    });
  } catch (error) {
    console.error("Delete lesson error:", error);
    return res.status(500).json({
      message: "Lỗi server khi xóa bài học",
    });
  }
}