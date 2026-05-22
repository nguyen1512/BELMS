import { NextFunction, Request, Response } from "express";
import { db } from "../config/db";

type AuthRequest = Request & {
  user?: {
    id: string;
    email: string;
    roles?: {
      code: string;
      name: string;
    }[];
  };
};

export function requirePermission(permissionCode: string) {
  return async function (req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          message: "Bạn chưa đăng nhập",
        });
      }

      const superAdminCheck = await db.query(
        `
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND r.code = 'SUPER_ADMIN'
        LIMIT 1
        `,
        [userId]
      );

      if (superAdminCheck.rows.length > 0) {
        return next();
      }

      const permissionCheck = await db.query(
        `
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
          AND p.code = $2
        LIMIT 1
        `,
        [userId, permissionCode]
      );

      if (permissionCheck.rows.length === 0) {
        return res.status(403).json({
          message: "Bạn không có quyền thực hiện thao tác này",
          requiredPermission: permissionCode,
        });
      }

      return next();
    } catch (error) {
      console.error("Permission middleware error:", error);

      return res.status(500).json({
        message: "Lỗi server khi kiểm tra quyền",
      });
    }
  };
}