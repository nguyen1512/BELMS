import { Request, Response } from "express";
import { db } from "../config/db";

export async function getCourseCategories(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        code,
        group_name,
        description,
        priority,
        status,
        created_at,
        updated_at
      FROM course_categories
      ORDER BY priority DESC, created_at DESC
    `);

    return res.json({
      message: "Lấy danh mục khóa học thành công",
      categories: result.rows,
    });
  } catch (error) {
    console.error("Get course categories error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy danh mục khóa học",
    });
  }
}

export async function createCourseCategory(req: Request, res: Response) {
  try {
    const { name, code, group_name, description, priority, status } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        message: "Vui lòng nhập tên và mã danh mục",
      });
    }

    const result = await db.query(
      `
      INSERT INTO course_categories (
        name,
        code,
        group_name,
        description,
        priority,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        name,
        code,
        group_name || "GENERAL",
        description || null,
        priority || 0,
        status || "active",
      ]
    );

    return res.status(201).json({
      message: "Tạo danh mục khóa học thành công",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Create course category error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo danh mục khóa học",
    });
  }
}

export async function updateCourseCategory(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { name, code, group_name, description, priority, status } = req.body;

    const result = await db.query(
      `
      UPDATE course_categories
      SET
        name = $1,
        code = $2,
        group_name = $3,
        description = $4,
        priority = $5,
        status = $6,
        updated_at = now()
      WHERE id = $7
      RETURNING *
      `,
      [
        name,
        code,
        group_name || "GENERAL",
        description || null,
        priority || 0,
        status || "active",
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy danh mục",
      });
    }

    return res.json({
      message: "Cập nhật danh mục khóa học thành công",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Update course category error:", error);
    return res.status(500).json({
      message: "Lỗi server khi cập nhật danh mục",
    });
  }
}

export async function deleteCourseCategory(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const result = await db.query(
      `
      DELETE FROM course_categories
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy danh mục",
      });
    }

    return res.json({
      message: "Xóa danh mục khóa học thành công",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Delete course category error:", error);
    return res.status(500).json({
      message: "Lỗi server khi xóa danh mục",
    });
  }
}