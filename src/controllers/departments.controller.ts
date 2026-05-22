import { Request, Response } from "express";
import { db } from "../config/db";
import { createAuditLog } from "../utils/auditLog";

function getAuthUserId(req: Request) {
  return String((req as any).user?.id || "");
}

export async function getDepartments(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        d.id,
        d.name,
        d.code,
        d.description,
        d.created_at,
        COALESCE(COUNT(u.id), 0)::int AS user_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      GROUP BY d.id
      ORDER BY d.name ASC
    `);

    return res.json({
      message: "Lấy danh sách phòng ban thành công",
      departments: result.rows,
    });
  } catch (error) {
    console.error("Get departments error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách phòng ban",
    });
  }
}

export async function createDepartment(req: Request, res: Response) {
  try {
    const { name, code, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        message: "Vui lòng nhập tên phòng ban và mã phòng ban",
      });
    }

    const existingDepartment = await db.query(
      `
      SELECT id
      FROM departments
      WHERE LOWER(code) = LOWER($1)
      LIMIT 1
      `,
      [code]
    );

    if (existingDepartment.rows.length > 0) {
      return res.status(409).json({
        message: "Mã phòng ban đã tồn tại",
      });
    }

    const result = await db.query(
      `
      INSERT INTO departments (
        name,
        code,
        description
      )
      VALUES ($1, $2, $3)
      RETURNING id, name, code, description, created_at
      `,
      [name, code, description || null]
    );

    await createAuditLog({
        userId: getAuthUserId(req) || null,
        action: "CREATE_DEPARTMENT",
        module: "DEPARTMENTS",
        targetId: String(result.rows[0].id),
        targetType: "departments",
        description: `Tạo phòng ban ${name}`,
        });

    return res.status(201).json({
      message: "Tạo phòng ban thành công",
      department: result.rows[0],
    });
  } catch (error) {
    console.error("Create department error:", error);

    return res.status(500).json({
      message: "Lỗi server khi tạo phòng ban",
    });
  }
}

export async function updateDepartment(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { name, code, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        message: "Vui lòng nhập tên phòng ban và mã phòng ban",
      });
    }

    const existingDepartment = await db.query(
      `
      SELECT id
      FROM departments
      WHERE LOWER(code) = LOWER($1)
        AND id <> $2
      LIMIT 1
      `,
      [code, id]
    );

    if (existingDepartment.rows.length > 0) {
      return res.status(409).json({
        message: "Mã phòng ban đã tồn tại",
      });
    }

    const result = await db.query(
      `
      UPDATE departments
      SET
        name = $1,
        code = $2,
        description = $3
      WHERE id = $4
      RETURNING id, name, code, description, created_at
      `,
      [name, code, description || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy phòng ban",
      });
    }

    await createAuditLog({
        userId: getAuthUserId(req) || null,
        action: "UPDATE_DEPARTMENT",
        module: "DEPARTMENTS",
        targetId: id,
        targetType: "departments",
        description: `Cập nhật phòng ban ${name}`,
        });

    return res.json({
      message: "Cập nhật phòng ban thành công",
      department: result.rows[0],
    });


  } catch (error) {
    console.error("Update department error:", error);

    return res.status(500).json({
      message: "Lỗi server khi cập nhật phòng ban",
    });
  }
}

export async function deleteDepartment(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");

    const userCheck = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE department_id = $1
      `,
      [id]
    );

    if (userCheck.rows[0].total > 0) {
      return res.status(400).json({
        message: "Không thể xóa phòng ban đang có nhân sự",
      });
    }

    const result = await db.query(
      `
      DELETE FROM departments
      WHERE id = $1
      RETURNING id, name, code
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy phòng ban",
      });
    }

    await createAuditLog({
        userId: getAuthUserId(req) || null,
        action: "DELETE_DEPARTMENT",
        module: "DEPARTMENTS",
        targetId: id,
        targetType: "departments",
        description: `Xóa phòng ban ${result.rows[0].name}`,
    });

    return res.json({
      message: "Xóa phòng ban thành công",
      department: result.rows[0],
    });

  } catch (error) {
    console.error("Delete department error:", error);

    return res.status(500).json({
      message: "Lỗi server khi xóa phòng ban",
    });
  }
}