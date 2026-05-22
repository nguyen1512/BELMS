import { Request, Response } from "express";
import { db } from "../config/db";

export async function getCourses(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        id,
        title,
        description,
        level,
        duration_minutes,
        status,
        created_at
      FROM courses
      ORDER BY created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách khóa học thành công",
      courses: result.rows,
    });
  } catch (error) {
    console.error("Get courses error:", error);
    return res.status(500).json({ message: "Lỗi server khi lấy khóa học" });
  }
}

export async function createCourse(req: Request, res: Response) {
  try {
    const { title, description, level, duration_minutes, status } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Vui lòng nhập tên khóa học" });
    }

    const result = await db.query(
      `
      INSERT INTO courses (
        title,
        description,
        level,
        duration_minutes,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, description, level, duration_minutes, status, created_at
      `,
      [
        title,
        description || null,
        level || "Cơ bản",
        duration_minutes || 0,
        status || "draft",
      ]
    );

    return res.status(201).json({
      message: "Tạo khóa học thành công",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("Create course error:", error);
    return res.status(500).json({ message: "Lỗi server khi tạo khóa học" });
  }
}

export async function updateCourse(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { title, description, level, duration_minutes, status } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Thiếu ID khóa học" });
    }

    if (!title) {
      return res.status(400).json({ message: "Vui lòng nhập tên khóa học" });
    }

    const result = await db.query(
      `
      UPDATE courses
      SET
        title = $1,
        description = $2,
        level = $3,
        duration_minutes = $4,
        status = $5,
        updated_at = now()
      WHERE id = $6
      RETURNING id, title, description, level, duration_minutes, status, created_at
      `,
      [
        title,
        description || null,
        level || "Cơ bản",
        duration_minutes || 0,
        status || "draft",
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    return res.json({
      message: "Cập nhật khóa học thành công",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("Update course error:", error);
    return res.status(500).json({ message: "Lỗi server khi cập nhật khóa học" });
  }
}

export async function deleteCourse(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    if (!id) {
      return res.status(400).json({ message: "Thiếu ID khóa học" });
    }

    const result = await db.query(
      `
      DELETE FROM courses
      WHERE id = $1
      RETURNING id, title
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    return res.json({
      message: "Xóa khóa học thành công",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("Delete course error:", error);
    return res.status(500).json({ message: "Lỗi server khi xóa khóa học" });
  }
}