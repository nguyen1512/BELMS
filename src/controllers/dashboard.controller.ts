import { Request, Response } from "express";
import { db } from "../config/db";

export async function getDashboardStats(
  req: Request,
  res: Response
) {
  try {
    const usersResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM users
    `);

    const activeUsersResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE status = 'active'
    `);

    const lockedUsersResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE status = 'locked'
    `);

    const departmentsResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM departments
    `);

    const rolesResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM roles
    `);

    const permissionsResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM permissions
    `);

    return res.json({
      message: "Lấy dashboard thành công",

      stats: {
        totalUsers: usersResult.rows[0].total,
        activeUsers: activeUsersResult.rows[0].total,
        lockedUsers: lockedUsersResult.rows[0].total,
        totalDepartments: departmentsResult.rows[0].total,
        totalRoles: rolesResult.rows[0].total,
        totalPermissions: permissionsResult.rows[0].total,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy dashboard",
    });
  }
}