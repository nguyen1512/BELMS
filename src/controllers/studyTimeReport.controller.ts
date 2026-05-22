import { Request, Response } from "express";
import { db } from "../config/db";

function toSafeNumber(value: any, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function buildStudyTimeRangeCondition(range?: string) {
  if (!range || range === "7d") {
    return "lp.updated_at >= NOW() - INTERVAL '7 days'";
  }

  if (range === "30d") {
    return "lp.updated_at >= NOW() - INTERVAL '30 days'";
  }

  if (range === "90d") {
    return "lp.updated_at >= NOW() - INTERVAL '90 days'";
  }

  if (range === "month") {
    return "lp.updated_at >= date_trunc('month', CURRENT_DATE)";
  }

  if (range === "quarter") {
    return "lp.updated_at >= date_trunc('quarter', CURRENT_DATE)";
  }

  if (range === "year") {
    return "lp.updated_at >= date_trunc('year', CURRENT_DATE)";
  }

  if (range === "all") {
    return "";
  }

  return "lp.updated_at >= NOW() - INTERVAL '7 days'";
}

function formatDateVi(value: any) {
  if (!value) return "Chưa xác định";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Chưa xác định";
  }

  return date.toLocaleDateString("vi-VN");
}

export const getStudyTimeReport = async (req: Request, res: Response) => {
  try {
    const {
      search = "",
      range = "7d",
      department_id = "all",
      status = "all",
    } = req.query as {
      search?: string;
      range?: string;
      department_id?: string;
      status?: string;
    };

    const values: any[] = [];
    let paramIndex = 1;

    const whereParts: string[] = ["1 = 1"];

    const rangeCondition = buildStudyTimeRangeCondition(range);
    if (rangeCondition) {
      whereParts.push(rangeCondition);
    }

    if (department_id && department_id !== "all") {
      values.push(department_id);
      whereParts.push(`u.department_id = $${paramIndex}`);
      paramIndex++;
    }

    if (status && status !== "all") {
      values.push(status);
      whereParts.push(`LOWER(COALESCE(lp.status, '')) = LOWER($${paramIndex})`);
      paramIndex++;
    }

    if (search && search.trim() !== "") {
      values.push(`%${search.trim()}%`);

      whereParts.push(`
        (
          u.full_name ILIKE $${paramIndex}
          OR u.email ILIKE $${paramIndex}
          OR u.phone ILIKE $${paramIndex}
          OR u.position ILIKE $${paramIndex}
          OR d.name ILIKE $${paramIndex}
          OR c.title ILIKE $${paramIndex}
          OR c.code ILIKE $${paramIndex}
        )
      `);

      paramIndex++;
    }

    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const summaryQuery = `
      WITH current_data AS (
        SELECT
          COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS total_minutes,
          COUNT(DISTINCT lp.user_id)::int AS active_learners
        FROM lesson_progress lp
        LEFT JOIN users u ON u.id = lp.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN courses c ON c.id = lp.course_id
        ${whereSql}
      ),
      previous_data AS (
        SELECT
          COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS previous_total_minutes
        FROM lesson_progress lp
        LEFT JOIN users u ON u.id = lp.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN courses c ON c.id = lp.course_id
        WHERE lp.updated_at >= NOW() - INTERVAL '60 days'
          AND lp.updated_at < NOW() - INTERVAL '30 days'
      )
      SELECT
        cd.total_minutes,
        cd.active_learners,
        pd.previous_total_minutes
      FROM current_data cd
      CROSS JOIN previous_data pd;
    `;

    const departmentStudyTimeQuery = `
      SELECT
        d.id AS department_id,
        COALESCE(d.name, 'Chưa có phòng ban') AS department_name,
        COUNT(DISTINCT u.id)::int AS employee_count,
        COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS total_minutes,
        CASE
          WHEN COUNT(DISTINCT u.id) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric / 60)
            / COUNT(DISTINCT u.id)::numeric,
            1
          )
        END AS avg_hours
      FROM lesson_progress lp
      LEFT JOIN users u ON u.id = lp.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = lp.course_id
      ${whereSql}
      GROUP BY d.id, d.name
      ORDER BY total_minutes DESC, department_name ASC
      LIMIT 10;
    `;

    const timeSlotQuery = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 0 AND EXTRACT(HOUR FROM lp.updated_at) < 2 THEN '00:00 - 02:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 2 AND EXTRACT(HOUR FROM lp.updated_at) < 4 THEN '02:00 - 04:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 4 AND EXTRACT(HOUR FROM lp.updated_at) < 6 THEN '04:00 - 06:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 6 AND EXTRACT(HOUR FROM lp.updated_at) < 8 THEN '06:00 - 08:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 8 AND EXTRACT(HOUR FROM lp.updated_at) < 10 THEN '08:00 - 10:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 10 AND EXTRACT(HOUR FROM lp.updated_at) < 12 THEN '10:00 - 12:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 12 AND EXTRACT(HOUR FROM lp.updated_at) < 14 THEN '12:00 - 14:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 14 AND EXTRACT(HOUR FROM lp.updated_at) < 16 THEN '14:00 - 16:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 16 AND EXTRACT(HOUR FROM lp.updated_at) < 18 THEN '16:00 - 18:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 18 AND EXTRACT(HOUR FROM lp.updated_at) < 20 THEN '18:00 - 20:00'
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 20 AND EXTRACT(HOUR FROM lp.updated_at) < 22 THEN '20:00 - 22:00'
          ELSE '22:00 - 00:00'
        END AS time_slot,
        COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS total_minutes
      FROM lesson_progress lp
      LEFT JOIN users u ON u.id = lp.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = lp.course_id
      ${whereSql}
      GROUP BY time_slot
      ORDER BY total_minutes DESC
      LIMIT 5;
    `;

    const courseStudyTimeQuery = `
      SELECT
        c.id AS course_id,
        COALESCE(c.title, 'Chưa có tên khóa học') AS course_name,
        COUNT(DISTINCT lp.user_id)::int AS learners,
        COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS total_minutes,
        CASE
          WHEN COUNT(DISTINCT lp.user_id) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric / 60)
            / COUNT(DISTINCT lp.user_id)::numeric,
            1
          )
        END AS avg_hours
      FROM lesson_progress lp
      LEFT JOIN users u ON u.id = lp.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = lp.course_id
      ${whereSql}
      GROUP BY c.id, c.title
      ORDER BY total_minutes DESC, course_name ASC
      LIMIT 8;
    `;

    const learnerStudyTimeQuery = `
      SELECT
        u.id AS user_id,
        COALESCE(u.full_name, 'Chưa có tên nhân sự') AS full_name,
        COALESCE(d.name, 'Chưa có phòng ban') AS department_name,
        COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0)::numeric AS total_minutes,
        COUNT(DISTINCT lp.lesson_id)::int AS lessons,
        MAX(lp.updated_at) AS last_study_at,
        CASE
          WHEN COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0) >= 300 THEN 'Tích cực'
          WHEN COALESCE(SUM(COALESCE(lp.watched_minutes, 0)), 0) >= 60 THEN 'Ổn định'
          ELSE 'Cần nhắc'
        END AS study_status
      FROM lesson_progress lp
      LEFT JOIN users u ON u.id = lp.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = lp.course_id
      ${whereSql}
      GROUP BY u.id, u.full_name, d.name
      ORDER BY total_minutes DESC, full_name ASC
      LIMIT 10;
    `;

    const statusBreakdownQuery = `
      SELECT
        COALESCE(lp.status, 'unknown') AS status,
        COUNT(*)::int AS total
      FROM lesson_progress lp
      LEFT JOIN users u ON u.id = lp.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = lp.course_id
      ${whereSql}
      GROUP BY COALESCE(lp.status, 'unknown')
      ORDER BY total DESC;
    `;

    const departmentsFilterQuery = `
      SELECT id, name
      FROM departments
      WHERE COALESCE(status, 'active') = 'active'
      ORDER BY name ASC;
    `;

    const [
      summaryResult,
      departmentStudyTimeResult,
      timeSlotResult,
      courseStudyTimeResult,
      learnerStudyTimeResult,
      statusBreakdownResult,
      departmentsFilterResult,
    ] = await Promise.all([
      db.query(summaryQuery, values),
      db.query(departmentStudyTimeQuery, values),
      db.query(timeSlotQuery, values),
      db.query(courseStudyTimeQuery, values),
      db.query(learnerStudyTimeQuery, values),
      db.query(statusBreakdownQuery, values),
      db.query(departmentsFilterQuery),
    ]);

    const summaryRow = summaryResult.rows[0] || {};

    const totalMinutes = toSafeNumber(summaryRow.total_minutes);
    const activeLearners = toSafeNumber(summaryRow.active_learners);
    const previousTotalMinutes = toSafeNumber(summaryRow.previous_total_minutes);

    const totalStudyHours = Number((totalMinutes / 60).toFixed(1));

    const avgHoursPerUser =
      activeLearners > 0
        ? Number((totalStudyHours / activeLearners).toFixed(1))
        : 0;

    const growthPercent =
      previousTotalMinutes > 0
        ? Number(
            (
              ((totalMinutes - previousTotalMinutes) / previousTotalMinutes) *
              100
            ).toFixed(1)
          )
        : totalMinutes > 0
        ? 100
        : 0;

    const maxDepartmentMinutes = Math.max(
      ...departmentStudyTimeResult.rows.map((item) =>
        toSafeNumber(item.total_minutes)
      ),
      1
    );

    const departmentStudyTime = departmentStudyTimeResult.rows.map((item) => {
      const totalDeptMinutes = toSafeNumber(item.total_minutes);

      return {
        departmentId: item.department_id,
        departmentName: item.department_name,
        employeeCount: toSafeNumber(item.employee_count),
        totalHours: Number((totalDeptMinutes / 60).toFixed(1)),
        avgHours: toSafeNumber(item.avg_hours),
        percent: Math.round((totalDeptMinutes / maxDepartmentMinutes) * 100),
      };
    });

    const maxSlotMinutes = Math.max(
      ...timeSlotResult.rows.map((item) => toSafeNumber(item.total_minutes)),
      1
    );

    const topStudyTimeSlots = timeSlotResult.rows.map((item, index) => {
      const totalSlotMinutes = toSafeNumber(item.total_minutes);

      return {
        rank: index + 1,
        timeSlot: item.time_slot,
        description:
          index === 0
            ? "Khung giờ học cao nhất"
            : index === 1
            ? "Tập trung học nhiều"
            : "Có hoạt động học đáng chú ý",
        totalHours: Number((totalSlotMinutes / 60).toFixed(1)),
        percent: Math.round((totalSlotMinutes / maxSlotMinutes) * 100),
      };
    });

    const maxCourseMinutes = Math.max(
      ...courseStudyTimeResult.rows.map((item) =>
        toSafeNumber(item.total_minutes)
      ),
      1
    );

    const courseStudyTime = courseStudyTimeResult.rows.map((item) => {
      const totalCourseMinutes = toSafeNumber(item.total_minutes);

      return {
        courseId: item.course_id,
        course: item.course_name,
        hours: Number((totalCourseMinutes / 60).toFixed(1)),
        learners: toSafeNumber(item.learners),
        avg: toSafeNumber(item.avg_hours),
        progress: Math.round((totalCourseMinutes / maxCourseMinutes) * 100),
      };
    });

    const learnerStudyTime = learnerStudyTimeResult.rows.map((item) => {
      const totalLearnerMinutes = toSafeNumber(item.total_minutes);

      return {
        userId: item.user_id,
        name: item.full_name,
        department: item.department_name,
        hours: Number((totalLearnerMinutes / 60).toFixed(1)),
        lessons: toSafeNumber(item.lessons),
        lastStudy: formatDateVi(item.last_study_at),
        status: item.study_status,
      };
    });

    const statusBreakdown = statusBreakdownResult.rows.map((item) => ({
      status: item.status,
      total: toSafeNumber(item.total),
    }));

    const departments = departmentsFilterResult.rows.map((item) => ({
      id: item.id,
      name: item.name,
    }));

    return res.status(200).json({
      success: true,
      message: "Lấy báo cáo thời gian học tập thành công",
      data: {
        summary: {
          totalStudyHours,
          activeLearners,
          avgHoursPerUser,
          growthPercent,
        },
        departmentStudyTime,
        topStudyTimeSlots,
        courseStudyTime,
        learnerStudyTime,
        statusBreakdown,
        filters: {
          departments,
          ranges: [
            { value: "7d", label: "7 ngày gần đây" },
            { value: "30d", label: "30 ngày gần đây" },
            { value: "90d", label: "90 ngày gần đây" },
            { value: "month", label: "Tháng này" },
            { value: "quarter", label: "Quý này" },
            { value: "year", label: "Năm nay" },
            { value: "all", label: "Tất cả thời gian" },
          ],
          statuses: [
            { value: "all", label: "Tất cả trạng thái" },
            { value: "not_started", label: "Chưa bắt đầu" },
            { value: "learning", label: "Đang học" },
            { value: "in_progress", label: "Đang tiến hành" },
            { value: "completed", label: "Hoàn thành" },
          ],
        },
      },
    });
  } catch (error: any) {
    console.error("getStudyTimeReport error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy báo cáo thời gian học tập",
      error: error.message,
    });
  }
};