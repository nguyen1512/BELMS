import { Request, Response } from "express";
import { db } from "../config/db";

export async function getResources(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        id,
        title,
        file_name,
        file_type,
        file_url,
        size_mb,
        storage_provider,
        status,
        resource_type,
        created_at,
        updated_at
      FROM learning_resources
      ORDER BY created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách tài nguyên thành công",
      resources: result.rows,
    });
  } catch (error) {
    console.error("Get resources error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy tài nguyên",
    });
  }
}

export async function createResource(req: Request, res: Response) {
  try {
    const {
      title,
      file_name,
      file_type,
      file_url,
      size_mb,
      storage_provider,
      status,
      resource_type,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        message: "Vui lòng nhập tên tài nguyên",
      });
    }

    const result = await db.query(
      `
      INSERT INTO learning_resources (
        title,
        file_name,
        file_type,
        file_url,
        size_mb,
        storage_provider,
        status,
        resource_type
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        title,
        file_name || null,
        file_type || "document",
        file_url || null,
        size_mb || 0,
        storage_provider || "cloudinary",
        status || "ready",
        resource_type || "document",
      ]
    );

    return res.status(201).json({
      message: "Tạo tài nguyên thành công",
      resource: result.rows[0],
    });
  } catch (error) {
    console.error("Create resource error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo tài nguyên",
    });
  }
}

export async function updateResourceStatus(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        message: "Vui lòng chọn trạng thái",
      });
    }

    const result = await db.query(
      `
      UPDATE learning_resources
      SET status = $1,
          updated_at = now()
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy tài nguyên",
      });
    }

    return res.json({
      message: "Cập nhật trạng thái tài nguyên thành công",
      resource: result.rows[0],
    });
  } catch (error) {
    console.error("Update resource status error:", error);
    return res.status(500).json({
      message: "Lỗi server khi cập nhật tài nguyên",
    });
  }
}

export async function deleteResource(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const result = await db.query(
      `
      DELETE FROM learning_resources
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy tài nguyên",
      });
    }

    return res.json({
      message: "Xóa tài nguyên thành công",
      resource: result.rows[0],
    });
  } catch (error) {
    console.error("Delete resource error:", error);
    return res.status(500).json({
      message: "Lỗi server khi xóa tài nguyên",
    });
  }
}