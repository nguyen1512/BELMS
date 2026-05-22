import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../config/db";

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    const userResult = await db.query(
      `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.password_hash,
        u.status,
        d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.email = $1
      LIMIT 1
      `,
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Tài khoản đã bị khóa hoặc chưa được kích hoạt",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const rolesResult = await db.query(
      `
      SELECT r.code, r.name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      `,
      [user.id]
    );

    const roles = rolesResult.rows;

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        roles: roles.map((role) => role.code),
      },
      process.env.JWT_SECRET || "anu_lms_secret_key",
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        departmentName: user.department_name,
        roles,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Lỗi server khi đăng nhập",
    });
  }
}

export async function me(req: Request, res: Response) {
  return res.json({
    message: "Lấy thông tin tài khoản thành công",
    user: (req as any).user,
  });
}