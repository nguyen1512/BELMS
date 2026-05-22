import { Request, Response } from "express";
import { pool } from "../config/db";

const normalizeBadge = (row: any) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  description: row.description,
  icon: row.icon,
  badge_type: row.badge_type,
  color: row.color,
  reward_points: Number(row.reward_points || 0),
  condition_type: row.condition_type,
  condition_value: Number(row.condition_value || 0),
  course_id: row.course_id,
  course_title: row.course_title || null,
  is_automation: Boolean(row.is_automation),
  status: row.status,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
  total_earned: Number(row.total_earned || 0),
});

export const getBadges = async (req: Request, res: Response) => {
  try {
    const { search, badge_type, status } = req.query;

    const values: any[] = [];
    const conditions: string[] = ["b.deleted_at IS NULL"];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        b.name ILIKE $${values.length}
        OR b.description ILIKE $${values.length}
        OR b.badge_type ILIKE $${values.length}
        OR b.code ILIKE $${values.length}
      )`);
    }

    if (badge_type && badge_type !== "all") {
      values.push(badge_type);
      conditions.push(`b.badge_type = $${values.length}`);
    }

    if (status && status !== "all") {
      values.push(status);
      conditions.push(`b.status = $${values.length}`);
    }

    const query = `
      SELECT
        b.*,
        c.title AS course_title,
        COUNT(ub.id) AS total_earned
      FROM badges b
      LEFT JOIN courses c ON c.id = b.course_id
      LEFT JOIN user_badges ub ON ub.badge_id = b.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY b.id, c.title
      ORDER BY b.created_at DESC
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách huy hiệu thành công",
      data: result.rows.map(normalizeBadge),
    });
  } catch (error) {
    console.error("GET BADGES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách huy hiệu",
    });
  }
};

export const getBadgeStats = async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_badges,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
          AND is_automation = true
          AND status = 'active'
        ) AS active_automations,
        COALESCE(SUM(reward_points) FILTER (WHERE deleted_at IS NULL), 0) AS total_reward_points,
        (
          SELECT COUNT(*)
          FROM user_badges
        ) AS total_earned
      FROM badges
    `;

    const result = await pool.query(query);
    const row = result.rows[0];

    return res.status(200).json({
      success: true,
      message: "Lấy thống kê huy hiệu thành công",
      data: {
        total_badges: Number(row.total_badges || 0),
        active_automations: Number(row.active_automations || 0),
        total_reward_points: Number(row.total_reward_points || 0),
        total_earned: Number(row.total_earned || 0),
      },
    });
  } catch (error) {
    console.error("GET BADGE STATS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê huy hiệu",
    });
  }
};

export const getBadgeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        b.*,
        c.title AS course_title,
        COUNT(ub.id) AS total_earned
      FROM badges b
      LEFT JOIN courses c ON c.id = b.course_id
      LEFT JOIN user_badges ub ON ub.badge_id = b.id
      WHERE b.id = $1
      AND b.deleted_at IS NULL
      GROUP BY b.id, c.title
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy huy hiệu",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết huy hiệu thành công",
      data: normalizeBadge(result.rows[0]),
    });
  } catch (error) {
    console.error("GET BADGE BY ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết huy hiệu",
    });
  }
};

export const createBadge = async (req: Request, res: Response) => {
  try {
    const {
      name,
      code,
      description,
      icon,
      badge_type,
      color,
      reward_points,
      condition_type,
      condition_value,
      course_id,
      is_automation,
      status,
      created_by,
    } = req.body;

    if (!name || String(name).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Tên huy hiệu là bắt buộc",
      });
    }

    const query = `
      INSERT INTO badges (
        name,
        code,
        description,
        icon,
        badge_type,
        color,
        reward_points,
        condition_type,
        condition_value,
        course_id,
        is_automation,
        status,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13
      )
      RETURNING *
    `;

    const values = [
      String(name).trim(),
      code || null,
      description || null,
      icon || "trophy",
      badge_type || "achievement",
      color || "orange",
      Number(reward_points || 0),
      condition_type || null,
      condition_value !== undefined ? Number(condition_value) : null,
      course_id || null,
      Boolean(is_automation || false),
      status || "active",
      created_by || null,
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Tạo huy hiệu thành công",
      data: normalizeBadge(result.rows[0]),
    });
  } catch (error) {
    console.error("CREATE BADGE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo huy hiệu",
    });
  }
};

export const updateBadge = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      name,
      code,
      description,
      icon,
      badge_type,
      color,
      reward_points,
      condition_type,
      condition_value,
      course_id,
      is_automation,
      status,
    } = req.body;

    const checkResult = await pool.query(
      `SELECT id FROM badges WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy huy hiệu để cập nhật",
      });
    }

    const query = `
      UPDATE badges
      SET
        name = COALESCE($1, name),
        code = $2,
        description = $3,
        icon = COALESCE($4, icon),
        badge_type = COALESCE($5, badge_type),
        color = COALESCE($6, color),
        reward_points = COALESCE($7, reward_points),
        condition_type = $8,
        condition_value = $9,
        course_id = $10,
        is_automation = COALESCE($11, is_automation),
        status = COALESCE($12, status),
        updated_at = NOW()
      WHERE id = $13
      AND deleted_at IS NULL
      RETURNING *
    `;

    const values = [
      name ? String(name).trim() : null,
      code || null,
      description || null,
      icon || null,
      badge_type || null,
      color || null,
      reward_points !== undefined ? Number(reward_points) : null,
      condition_type || null,
      condition_value !== undefined ? Number(condition_value) : null,
      course_id || null,
      is_automation !== undefined ? Boolean(is_automation) : null,
      status || null,
      id,
    ];

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Cập nhật huy hiệu thành công",
      data: normalizeBadge(result.rows[0]),
    });
  } catch (error) {
    console.error("UPDATE BADGE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật huy hiệu",
    });
  }
};

export const deleteBadge = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE badges
      SET
        deleted_at = NOW(),
        status = 'deleted',
        updated_at = NOW()
      WHERE id = $1
      AND deleted_at IS NULL
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy huy hiệu để xóa",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa huy hiệu thành công",
      data: {
        id,
      },
    });
  } catch (error) {
    console.error("DELETE BADGE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa huy hiệu",
    });
  }
};

export const toggleBadgeAutomation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE badges
      SET
        is_automation = NOT is_automation,
        updated_at = NOW()
      WHERE id = $1
      AND deleted_at IS NULL
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy huy hiệu",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái automation thành công",
      data: normalizeBadge(result.rows[0]),
    });
  } catch (error) {
    console.error("TOGGLE BADGE AUTOMATION ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật automation",
    });
  }
};

export const getBadgeCourses = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        status
      FROM courses
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách khóa học thành công",
      data: result.rows,
    });
  } catch (error) {
    console.error("GET BADGE COURSES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách khóa học",
    });
  }
};