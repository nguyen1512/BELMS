import { Request, Response } from "express";
import { db, pool } from "../config/db";

function getUserIdFromRequest(req: Request): string | null {
  const userFromAuth = (req as any).user;

  return (
    userFromAuth?.id ||
    userFromAuth?.user_id ||
    req.headers["x-user-id"]?.toString() ||
    req.query.userId?.toString() ||
    null
  );
}

export const getEmployeeTrainingSchedule = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy userId. Vui lòng truyền userId hoặc kiểm tra middleware đăng nhập.",
      });
    }

    const result = await db.query(
      `
      SELECT
        lc.id,
        lc.course_id,
        lc.instructor_id,
        lc.title,
        lc.description,
        lc.class_date,
        lc.start_time,
        lc.end_time,

        COALESCE(lc.meeting_link, lc.meeting_url) AS meeting_url,
        COALESCE(lc.room_name, lc.location) AS location,

        lc.room_name,
        lc.status,
        lc.training_type,
        lc.note,

        i.full_name AS instructor_name,
        i.name AS instructor_display_name,

        d.id AS department_id,
        d.name AS department_name,

        COALESCE(a.registration_status, 'not_registered') AS registration_status,
        COALESCE(a.checkin_status, 'not_checked_in') AS checkin_status,
        a.registered_at,
        a.checked_in_at,
        a.attended_at,

        CASE
          WHEN lc.class_date IS NULL THEN NULL
          ELSE (lc.class_date + lc.start_time)
        END AS start_datetime,

        CASE
          WHEN lc.class_date IS NULL THEN NULL
          ELSE (lc.class_date + lc.end_time)
        END AS end_datetime

      FROM live_classes lc

      INNER JOIN live_class_departments lcd
        ON lcd.live_class_id = lc.id

      INNER JOIN users u
        ON u.department_id = lcd.department_id

      INNER JOIN departments d
        ON d.id = lcd.department_id

      LEFT JOIN instructors i
        ON i.id = lc.instructor_id

      LEFT JOIN live_class_attendance a
        ON a.live_class_id = lc.id
       AND a.user_id = u.id

      WHERE u.id = $1
        AND COALESCE(lc.status, 'scheduled') NOT IN ('deleted', 'cancelled', 'inactive')

      ORDER BY lc.class_date ASC NULLS LAST, lc.start_time ASC
      `,
      [userId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getEmployeeTrainingSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy lịch đào tạo trực tiếp",
      error: error.message,
    });
  }
};

export const getEmployeeTrainingScheduleStats = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy userId. Vui lòng truyền userId hoặc kiểm tra middleware đăng nhập.",
      });
    }

    const result = await db.query(
      `
      WITH employee_classes AS (
        SELECT
          lc.id,
          lc.class_date,
          lc.training_type,
          a.registration_status,
          a.checkin_status,
          a.attended_at
        FROM live_classes lc

        INNER JOIN live_class_departments lcd
          ON lcd.live_class_id = lc.id

        INNER JOIN users u
          ON u.department_id = lcd.department_id

        LEFT JOIN live_class_attendance a
          ON a.live_class_id = lc.id
         AND a.user_id = u.id

        WHERE u.id = $1
          AND lc.class_date >= date_trunc('month', CURRENT_DATE)::date
          AND lc.class_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
          AND COALESCE(lc.status, 'scheduled') NOT IN ('deleted', 'cancelled', 'inactive')
      )
      SELECT
        COUNT(*)::int AS total_this_month,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(training_type, 'online')) = 'online'
        )::int AS online_count,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(training_type, 'online')) IN ('offline', 'onsite')
        )::int AS offline_count,

        COUNT(*) FILTER (
          WHERE registration_status = 'registered'
        )::int AS registered_count,

        COUNT(*) FILTER (
          WHERE checkin_status = 'checked_in'
             OR attended_at IS NOT NULL
        )::int AS attended_count,

        CASE
          WHEN COUNT(*) FILTER (WHERE registration_status = 'registered') = 0 THEN 0
          ELSE ROUND(
            (
              COUNT(*) FILTER (
                WHERE checkin_status = 'checked_in'
                   OR attended_at IS NOT NULL
              )::numeric
              /
              NULLIF(COUNT(*) FILTER (WHERE registration_status = 'registered'), 0)
            ) * 100
          )::int
        END AS attendance_rate
      FROM employee_classes
      `,
      [userId]
    );

    const stats = result.rows[0] || {
      total_this_month: 0,
      online_count: 0,
      offline_count: 0,
      registered_count: 0,
      attended_count: 0,
      attendance_rate: 0,
    };

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("getEmployeeTrainingScheduleStats error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê lịch đào tạo",
      error: error.message,
    });
  }
};

export const registerLiveClass = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const liveClassId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy userId.",
      });
    }

    const accessCheck = await db.query(
      `
      SELECT lc.id
      FROM live_classes lc
      INNER JOIN live_class_departments lcd
        ON lcd.live_class_id = lc.id
      INNER JOIN users u
        ON u.department_id = lcd.department_id
      WHERE lc.id = $1
        AND u.id = $2
      LIMIT 1
      `,
      [liveClassId, userId]
    );

    if (accessCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "Bạn không thuộc phòng ban được gán cho lớp đào tạo này.",
      });
    }

    const result = await db.query(
      `
      INSERT INTO live_class_attendance (
        live_class_id,
        user_id,
        registration_status,
        checkin_status,
        registered_at
      )
      VALUES ($1, $2, 'registered', 'not_checked_in', NOW())
      ON CONFLICT (live_class_id, user_id)
      DO UPDATE SET
        registration_status = 'registered',
        registered_at = COALESCE(live_class_attendance.registered_at, NOW()),
        updated_at = NOW()
      RETURNING *
      `,
      [liveClassId, userId]
    );

    return res.json({
      success: true,
      message: "Đăng ký lớp đào tạo thành công",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("registerLiveClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi đăng ký lớp đào tạo",
      error: error.message,
    });
  }
};

export const checkInLiveClass = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const liveClassId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Không tìm thấy userId.",
      });
    }

    const accessCheck = await db.query(
      `
      SELECT lc.id
      FROM live_classes lc
      INNER JOIN live_class_departments lcd
        ON lcd.live_class_id = lc.id
      INNER JOIN users u
        ON u.department_id = lcd.department_id
      WHERE lc.id = $1
        AND u.id = $2
      LIMIT 1
      `,
      [liveClassId, userId]
    );

    if (accessCheck.rowCount === 0) {
      return res.status(403).json({
        success: false,
        message: "Bạn không thuộc phòng ban được gán cho lớp đào tạo này.",
      });
    }

    const result = await db.query(
      `
      INSERT INTO live_class_attendance (
        live_class_id,
        user_id,
        registration_status,
        checkin_status,
        registered_at,
        checked_in_at,
        attended_at
      )
      VALUES ($1, $2, 'registered', 'checked_in', NOW(), NOW(), NOW())
      ON CONFLICT (live_class_id, user_id)
      DO UPDATE SET
        registration_status = 'registered',
        checkin_status = 'checked_in',
        checked_in_at = NOW(),
        attended_at = COALESCE(live_class_attendance.attended_at, NOW()),
        updated_at = NOW()
      RETURNING *
      `,
      [liveClassId, userId]
    );

    return res.json({
      success: true,
      message: "Check-in thành công",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("checkInLiveClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi check-in lớp đào tạo",
      error: error.message,
    });
  }
};

export const getDepartmentsForLiveClass = async (req: Request, res: Response) => {
  try {
    const liveClassId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        d.id,
        d.name,
        d.code,
        d.description,
        d.status,
        CASE
          WHEN lcd.id IS NULL THEN false
          ELSE true
        END AS assigned
      FROM departments d
      LEFT JOIN live_class_departments lcd
        ON lcd.department_id = d.id
       AND lcd.live_class_id = $1
      WHERE COALESCE(d.status, 'active') = 'active'
      ORDER BY d.name ASC
      `,
      [liveClassId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getDepartmentsForLiveClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy phòng ban của lớp đào tạo",
      error: error.message,
    });
  }
};

export const assignDepartmentsToLiveClass = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const liveClassId = req.params.id;
    const { departmentIds } = req.body;

    if (!Array.isArray(departmentIds)) {
      return res.status(400).json({
        success: false,
        message: "departmentIds phải là một mảng UUID.",
      });
    }

    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM live_class_departments
      WHERE live_class_id = $1
      `,
      [liveClassId]
    );

    for (const departmentId of departmentIds) {
      await client.query(
        `
        INSERT INTO live_class_departments (
          live_class_id,
          department_id
        )
        VALUES ($1, $2)
        ON CONFLICT (live_class_id, department_id) DO NOTHING
        `,
        [liveClassId, departmentId]
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Gán phòng ban cho lớp đào tạo thành công",
      data: {
        liveClassId,
        departmentIds,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    console.error("assignDepartmentsToLiveClass error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi gán phòng ban cho lớp đào tạo",
      error: error.message,
    });
  } finally {
    client.release();
  }
};