import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "../config/db";
import { createAuditLog } from "../utils/auditLog";

type AuthRequest = Request & {
  user?: {
    id?: string;
  };
};

function getAuthUserId(req: Request) {
  return String((req as AuthRequest).user?.id || "");
}

export async function getUsers(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.position,
        u.status,
        u.department_id,
        d.name AS department_name,
        r.code AS role_code,
        r.name AS role_name,
        u.created_at
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      ORDER BY u.created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách tài khoản thành công",
      users: result.rows,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy tài khoản",
    });
  }
}

export async function createUser(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const { full_name, email, phone, password, department_id, position, role_code } =
      req.body;

    if (!full_name || !email || !password || !role_code) {
      return res.status(400).json({
        message: "Vui lòng nhập họ tên, email, mật khẩu và vai trò",
      });
    }

    await client.query("BEGIN");

    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Email đã tồn tại trong hệ thống",
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const userResult = await client.query(
      `
      INSERT INTO users (
        full_name,
        email,
        phone,
        password_hash,
        department_id,
        position,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING id, full_name, email, phone, department_id, position, status
      `,
      [
        full_name,
        email,
        phone || null,
        passwordHash,
        department_id || null,
        position || null,
      ]
    );

    const user = userResult.rows[0];

    const roleResult = await client.query(
      `SELECT id, code, name FROM roles WHERE code = $1 LIMIT 1`,
      [role_code]
    );

    if (roleResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Vai trò không tồn tại",
      });
    }

    const role = roleResult.rows[0];

    await client.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [user.id, role.id]
    );

    await client.query("COMMIT");

    await createAuditLog({
      userId: getAuthUserId(req) || null,
      action: "CREATE_USER",
      module: "USERS",
      targetId: String(user.id),
      targetType: "users",
      description: `Tạo tài khoản ${email}`,
    });

    return res.status(201).json({
      message: "Tạo tài khoản thành công",
      user: {
        ...user,
        role,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create user error:", error);

    return res.status(500).json({
      message: "Lỗi server khi tạo tài khoản",
    });
  } finally {
    client.release();
  }
}

export async function updateUser(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const id = String(req.params.id || "");
    const { full_name, email, password, department_id, position, role_code } =
      req.body;

    if (!id) {
      return res.status(400).json({
        message: "Thiếu ID tài khoản",
      });
    }

    if (!full_name || !email || !role_code) {
      return res.status(400).json({
        message: "Vui lòng nhập họ tên, email và vai trò",
      });
    }

    await client.query("BEGIN");

    const currentUser = await client.query(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (currentUser.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Không tìm thấy tài khoản",
      });
    }

    const existingEmail = await client.query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1`,
      [email, id]
    );

    if (existingEmail.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Email đã tồn tại trong hệ thống",
      });
    }

    if (password && String(password).trim() !== "") {
      const passwordHash = await bcrypt.hash(String(password), 10);

      await client.query(
        `
        UPDATE users
        SET
          full_name = $1,
          email = $2,
          password_hash = $3,
          department_id = $4,
          position = $5,
          updated_at = now()
        WHERE id = $6
        `,
        [
          full_name,
          email,
          passwordHash,
          department_id || null,
          position || null,
          id,
        ]
      );
    } else {
      await client.query(
        `
        UPDATE users
        SET
          full_name = $1,
          email = $2,
          department_id = $3,
          position = $4,
          updated_at = now()
        WHERE id = $5
        `,
        [full_name, email, department_id || null, position || null, id]
      );
    }

    const roleResult = await client.query(
      `SELECT id, code, name FROM roles WHERE code = $1 LIMIT 1`,
      [role_code]
    );

    if (roleResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Vai trò không tồn tại",
      });
    }

    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);

    await client.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      `,
      [id, roleResult.rows[0].id]
    );

    await client.query("COMMIT");

    await createAuditLog({
      userId: getAuthUserId(req) || null,
      action: "UPDATE_USER",
      module: "USERS",
      targetId: id,
      targetType: "users",
      description: `Cập nhật tài khoản ${email}`,
    });

    return res.json({
      message: "Cập nhật tài khoản thành công",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update user error:", error);

    return res.status(500).json({
      message: "Lỗi server khi cập nhật tài khoản",
    });
  } finally {
    client.release();
  }
}

export async function updateUserStatus(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Thiếu ID tài khoản",
      });
    }

    if (!["active", "locked"].includes(status)) {
      return res.status(400).json({
        message: "Trạng thái không hợp lệ",
      });
    }

    const result = await db.query(
      `
      UPDATE users
      SET status = $1, updated_at = now()
      WHERE id = $2
      RETURNING id, full_name, email, status
      `,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy tài khoản",
      });
    }

    await createAuditLog({
      userId: getAuthUserId(req) || null,
      action: status === "locked" ? "LOCK_USER" : "UNLOCK_USER",
      module: "USERS",
      targetId: id,
      targetType: "users",
      description: `${status === "locked" ? "Khóa" : "Mở khóa"} tài khoản ${
        result.rows[0].email
      }`,
    });

    return res.json({
      message: "Cập nhật trạng thái tài khoản thành công",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update user status error:", error);

    return res.status(500).json({
      message: "Lỗi server khi cập nhật trạng thái tài khoản",
    });
  }
}