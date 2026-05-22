import { Request, Response } from "express";
import { db } from "../config/db";
import { createAuditLog } from "../utils/auditLog";

function getAuthUserId(req: Request) {
  return String((req as any).user?.id || "");
}

export async function getRoles(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        id,
        code,
        name,
        description,
        created_at
      FROM roles
      ORDER BY name ASC
    `);

    return res.json({
      message: "Lấy danh sách vai trò thành công",
      roles: result.rows,
    });
  } catch (error) {
    console.error("Get roles error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách vai trò",
    });
  }
}

export async function getPermissions(req: Request, res: Response) {
  try {
    const result = await db.query(`
    SELECT
        id,
        code,
        action AS name,
        module,
        COALESCE(description, '') AS description
    FROM permissions
    ORDER BY module ASC, action ASC
    `);

    return res.json({
      message: "Lấy danh sách quyền thành công",
      permissions: result.rows,
    });
  } catch (error) {
    console.error("Get permissions error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách quyền",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getRolePermissions(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      SELECT permission_id
      FROM role_permissions
      WHERE role_id = $1
      `,
      [id]
    );

    return res.json({
      message: "Lấy quyền của vai trò thành công",
      permissionIds: result.rows.map((item) => item.permission_id),
    });
  } catch (error) {
    console.error("Get role permissions error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy quyền của vai trò",
    });
  }
}

export async function updateRolePermissions(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const { id } = req.params;
    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({
        message: "permissionIds phải là một mảng",
      });
    }

    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM role_permissions
      WHERE role_id = $1
      `,
      [id]
    );

    for (const permissionId of permissionIds) {
      await client.query(
        `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [id, permissionId]
      );
    }

    await client.query("COMMIT");

    await createAuditLog({
    userId: getAuthUserId(req) || null,
    action: "UPDATE_ROLE_PERMISSIONS",
    module: "ROLES",
    targetId: String(id),
    targetType: "roles",
    description: `Cập nhật ${permissionIds.length} quyền cho vai trò`,
    });

    return res.json({
    message: "Cập nhật quyền cho vai trò thành công",
    });
    
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Update role permissions error:", error);

    return res.status(500).json({
      message: "Lỗi server khi cập nhật quyền cho vai trò",
    });
  } finally {
    client.release();
  }
}