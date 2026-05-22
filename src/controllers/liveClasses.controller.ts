import { Request, Response } from "express";
import { db } from "../config/db";

export const getLiveClasses = async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT 
        lc.id,
        lc.title,
        lc.course_id,
        c.title AS course_title,
        lc.instructor_id,
        u.full_name AS instructor_name,
        lc.training_type,
        lc.class_date,
        lc.start_time,
        lc.end_time,
        lc.room_name,
        lc.meeting_link,
        lc.note,
        lc.status,
        lc.created_at,
        lc.updated_at
      FROM live_classes lc
      LEFT JOIN courses c ON lc.course_id = c.id
      LEFT JOIN users u ON lc.instructor_id = u.id
      ORDER BY lc.class_date DESC, lc.start_time DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách lớp đào tạo trực tiếp thành công",
      data: result.rows,
    });
  } catch (error) {
    console.error("GET LIVE CLASSES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách lớp đào tạo trực tiếp",
    });
  }
};

export const getLiveClassById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      SELECT 
        lc.id,
        lc.title,
        lc.course_id,
        c.title AS course_title,
        lc.instructor_id,
        u.full_name AS instructor_name,
        lc.training_type,
        lc.class_date,
        lc.start_time,
        lc.end_time,
        lc.room_name,
        lc.meeting_link,
        lc.note,
        lc.status,
        lc.created_at,
        lc.updated_at
      FROM live_classes lc
      LEFT JOIN courses c ON lc.course_id = c.id
      LEFT JOIN users u ON lc.instructor_id = u.id
      WHERE lc.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy buổi đào tạo",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết buổi đào tạo thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GET LIVE CLASS BY ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết buổi đào tạo",
    });
  }
};

export const createLiveClass = async (req: Request, res: Response) => {
  try {
    const {
      title,
      course_id,
      instructor_id,
      training_type,
      class_date,
      start_time,
      end_time,
      room_name,
      meeting_link,
      note,
      status,
    } = req.body;

    if (!title || !training_type || !class_date || !start_time) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ tên buổi đào tạo, hình thức, ngày và giờ bắt đầu",
      });
    }

    if (!["online", "offline"].includes(training_type)) {
      return res.status(400).json({
        success: false,
        message: "Hình thức đào tạo chỉ được là online hoặc offline",
      });
    }

    if (training_type === "online" && !meeting_link) {
      return res.status(400).json({
        success: false,
        message: "Buổi online cần có link Google Meet hoặc Zoom",
      });
    }

    if (training_type === "offline" && !room_name) {
      return res.status(400).json({
        success: false,
        message: "Buổi offline cần có tên phòng học",
      });
    }

    const result = await db.query(
      `
      INSERT INTO live_classes (
        title,
        course_id,
        instructor_id,
        training_type,
        class_date,
        start_time,
        end_time,
        room_name,
        meeting_link,
        note,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'scheduled'))
      RETURNING *
      `,
      [
        title,
        course_id || null,
        instructor_id || null,
        training_type,
        class_date,
        start_time,
        end_time || null,
        room_name || null,
        meeting_link || null,
        note || null,
        status || "scheduled",
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Tạo buổi đào tạo thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE LIVE CLASS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo buổi đào tạo",
    });
  }
};

export const updateLiveClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      title,
      course_id,
      instructor_id,
      training_type,
      class_date,
      start_time,
      end_time,
      room_name,
      meeting_link,
      note,
      status,
    } = req.body;

    const existing = await db.query(
      `SELECT * FROM live_classes WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy buổi đào tạo cần cập nhật",
      });
    }

    if (training_type && !["online", "offline"].includes(training_type)) {
      return res.status(400).json({
        success: false,
        message: "Hình thức đào tạo chỉ được là online hoặc offline",
      });
    }

    const result = await db.query(
      `
      UPDATE live_classes
      SET
        title = COALESCE($1, title),
        course_id = COALESCE($2, course_id),
        instructor_id = COALESCE($3, instructor_id),
        training_type = COALESCE($4, training_type),
        class_date = COALESCE($5, class_date),
        start_time = COALESCE($6, start_time),
        end_time = COALESCE($7, end_time),
        room_name = COALESCE($8, room_name),
        meeting_link = COALESCE($9, meeting_link),
        note = COALESCE($10, note),
        status = COALESCE($11, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
      `,
      [
        title || null,
        course_id || null,
        instructor_id || null,
        training_type || null,
        class_date || null,
        start_time || null,
        end_time || null,
        room_name || null,
        meeting_link || null,
        note || null,
        status || null,
        id,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật buổi đào tạo thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE LIVE CLASS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật buổi đào tạo",
    });
  }
};

export const deleteLiveClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `DELETE FROM live_classes WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy buổi đào tạo cần xóa",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa buổi đào tạo thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("DELETE LIVE CLASS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa buổi đào tạo",
    });
  }
};

export const getLiveClassStats = async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*)::int AS total_classes,

        COUNT(*) FILTER (
          WHERE training_type = 'online'
        )::int AS online_classes,

        COUNT(*) FILTER (
          WHERE training_type = 'offline'
        )::int AS offline_classes,

        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            (
              COUNT(*) FILTER (
                WHERE 
                  (training_type = 'online' AND meeting_link IS NOT NULL AND meeting_link <> '')
                  OR
                  (training_type = 'offline' AND room_name IS NOT NULL AND room_name <> '')
              )::numeric
              / COUNT(*)::numeric
            ) * 100
          )::int
        END AS configured_percent
      FROM live_classes
    `);

    return res.status(200).json({
      success: true,
      message: "Lấy thống kê lớp đào tạo trực tiếp thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GET LIVE CLASS STATS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê lớp đào tạo trực tiếp",
    });
  }
};