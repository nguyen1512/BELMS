import { Request, Response } from "express";
import { db } from "../config/db";

function buildDateCondition(period?: string, tableAlias = "e") {
  if (!period || period === "all") return "";

  if (period === "month") {
    return ` AND ${tableAlias}.enrolled_at >= date_trunc('month', CURRENT_DATE) `;
  }

  if (period === "quarter") {
    return ` AND ${tableAlias}.enrolled_at >= date_trunc('quarter', CURRENT_DATE) `;
  }

  if (period === "year") {
    return ` AND ${tableAlias}.enrolled_at >= date_trunc('year', CURRENT_DATE) `;
  }

  return "";
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

function toSafeNumber(value: any, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatDeadline(value: any) {
  if (!value) return "Chưa xác định";

  const enrolledAt = new Date(value);
  const deadline = new Date(enrolledAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  return deadline.toLocaleDateString("vi-VN");
}

export const getLearningOverviewReport = async (req: Request, res: Response) => {
  try {
    const {
      period = "month",
      department_id,
      status,
      search,
    } = req.query as {
      period?: string;
      department_id?: string;
      status?: string;
      search?: string;
    };

    const values: any[] = [];
    let paramIndex = 1;

    let userFilter = ` WHERE 1 = 1 `;
    let enrollmentFilter = ` WHERE 1 = 1 `;

    enrollmentFilter += buildDateCondition(period, "e");

    if (department_id && department_id !== "all") {
      values.push(department_id);

      userFilter += ` AND u.department_id = $${paramIndex}`;
      enrollmentFilter += ` AND u.department_id = $${paramIndex}`;

      paramIndex++;
    }

    if (status && status !== "all") {
      values.push(status);

      enrollmentFilter += ` AND e.status = $${paramIndex}`;

      paramIndex++;
    }

    if (search && search.trim() !== "") {
      values.push(`%${search.trim()}%`);

      userFilter += ` AND (
        u.full_name ILIKE $${paramIndex}
        OR u.email ILIKE $${paramIndex}
        OR u.phone ILIKE $${paramIndex}
        OR u.position ILIKE $${paramIndex}
      )`;

      enrollmentFilter += ` AND (
        u.full_name ILIKE $${paramIndex}
        OR u.email ILIKE $${paramIndex}
        OR u.phone ILIKE $${paramIndex}
        OR u.position ILIKE $${paramIndex}
        OR c.title ILIKE $${paramIndex}
        OR c.code ILIKE $${paramIndex}
        OR d.name ILIKE $${paramIndex}
      )`;

      paramIndex++;
    }

    const summaryQuery = `
      WITH learner_data AS (
        SELECT COUNT(DISTINCT u.id)::int AS total_learners
        FROM users u
        ${userFilter}
      ),
      course_data AS (
        SELECT COUNT(*)::int AS total_courses
        FROM courses c
        WHERE COALESCE(c.status, '') <> 'deleted'
      ),
      enrollment_data AS (
        SELECT
          COUNT(*)::int AS total_enrollments,

          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
               OR COALESCE(e.progress_percent, 0) >= 100
               OR e.completed_at IS NOT NULL
          )::int AS completed_enrollments,

          COALESCE(SUM(
            CASE
              WHEN LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
                OR COALESCE(e.progress_percent, 0) >= 100
                OR e.completed_at IS NOT NULL
              THEN COALESCE(c.duration_minutes, 0)
              ELSE ROUND(
                COALESCE(c.duration_minutes, 0) 
                * COALESCE(e.progress_percent, 0) 
                / 100.0
              )
            END
          ), 0)::numeric(12,2) AS total_learning_minutes

        FROM enrollments e
        LEFT JOIN users u ON u.id = e.user_id
        LEFT JOIN courses c ON c.id = e.course_id
        LEFT JOIN departments d ON d.id = u.department_id
        ${enrollmentFilter}
      ),
      certificate_data AS (
        SELECT COUNT(*)::int AS total_certificates
        FROM certificates cert
        WHERE COALESCE(cert.status, 'valid') = 'valid'
      ),
      score_data AS (
        SELECT
          COALESCE(
            ROUND(
              AVG(
                CASE
                  WHEN qa.total_score > 0 
                    THEN (qa.score::numeric / qa.total_score::numeric) * 100
                  ELSE qa.score::numeric
                END
              ),
              2
            ),
            0
          ) AS avg_score
        FROM quiz_attempts qa
        LEFT JOIN users u ON u.id = qa.user_id
        WHERE 1 = 1
        ${
          department_id && department_id !== "all"
            ? ` AND u.department_id = '${department_id}' `
            : ""
        }
      )
      SELECT
        ld.total_learners,
        cd.total_courses,
        ced.total_certificates,
        ed.total_enrollments,
        ed.completed_enrollments,
        ed.total_learning_minutes,
        sd.avg_score,
        CASE
          WHEN ed.total_enrollments = 0 THEN 0
          ELSE ROUND(
            (ed.completed_enrollments::numeric / ed.total_enrollments::numeric) * 100,
            2
          )
        END AS completion_rate
      FROM learner_data ld
      CROSS JOIN course_data cd
      CROSS JOIN enrollment_data ed
      CROSS JOIN certificate_data ced
      CROSS JOIN score_data sd;
    `;

    const departmentValues: any[] = [];
    let departmentParamIndex = 1;

    let departmentWhere = ` WHERE 1 = 1 `;

    if (department_id && department_id !== "all") {
      departmentValues.push(department_id);

      departmentWhere += ` AND d.id = $${departmentParamIndex} `;

      departmentParamIndex++;
    }

    if (search && search.trim() !== "") {
      departmentValues.push(`%${search.trim()}%`);

      departmentWhere += `
        AND (
          d.name ILIKE $${departmentParamIndex}
          OR u.full_name ILIKE $${departmentParamIndex}
          OR u.email ILIKE $${departmentParamIndex}
          OR u.phone ILIKE $${departmentParamIndex}
          OR u.position ILIKE $${departmentParamIndex}
          OR c.title ILIKE $${departmentParamIndex}
          OR c.code ILIKE $${departmentParamIndex}
        )
      `;

      departmentParamIndex++;
    }

    const departmentQuery = `
      WITH score_by_user AS (
        SELECT
          qa.user_id,
          COALESCE(
            ROUND(
              AVG(
                CASE
                  WHEN qa.total_score > 0 
                    THEN (qa.score::numeric / qa.total_score::numeric) * 100
                  ELSE qa.score::numeric
                END
              ),
              2
            ),
            0
          ) AS avg_score
        FROM quiz_attempts qa
        GROUP BY qa.user_id
      )
      SELECT
        d.id AS department_id,
        d.name AS department_name,

        COUNT(DISTINCT u.id)::int AS total_users,

        COUNT(DISTINCT CASE
          WHEN LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
            OR COALESCE(e.progress_percent, 0) >= 100
            OR e.completed_at IS NOT NULL
          THEN u.id
        END)::int AS completed_users,

        COALESCE(ROUND(AVG(sbu.avg_score), 2), 0) AS avg_score,

        CASE
          WHEN COUNT(DISTINCT u.id) = 0 THEN 0
          ELSE ROUND(
            (
              COUNT(DISTINCT CASE
                WHEN LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
                  OR COALESCE(e.progress_percent, 0) >= 100
                  OR e.completed_at IS NOT NULL
                THEN u.id
              END)::numeric / COUNT(DISTINCT u.id)::numeric
            ) * 100,
            2
          )
        END AS completion_rate

      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN enrollments e ON e.user_id = u.id
      LEFT JOIN courses c ON c.id = e.course_id
      LEFT JOIN score_by_user sbu ON sbu.user_id = u.id
      ${departmentWhere}
      GROUP BY d.id, d.name
      ORDER BY completion_rate DESC, d.name ASC;
    `;

    const indicatorsQuery = `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
              OR COALESCE(e.progress_percent, 0) >= 100
              OR e.completed_at IS NOT NULL
            THEN COALESCE(c.duration_minutes, 0)
            ELSE ROUND(
              COALESCE(c.duration_minutes, 0) 
              * COALESCE(e.progress_percent, 0) 
              / 100.0
            )
          END
        ), 0)::numeric(12,2) AS total_learning_minutes,

        (
          SELECT
            COALESCE(
              ROUND(
                AVG(
                  CASE
                    WHEN qa.total_score > 0 
                      THEN (qa.score::numeric / qa.total_score::numeric) * 100
                    ELSE qa.score::numeric
                  END
                ),
                2
              ),
              0
            )
          FROM quiz_attempts qa
          LEFT JOIN users qu ON qu.id = qa.user_id
          WHERE 1 = 1
          ${
            department_id && department_id !== "all"
              ? ` AND qu.department_id = '${department_id}' `
              : ""
          }
        ) AS average_score,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(e.status, '')) IN ('completed', 'done', 'finished')
             OR COALESCE(e.progress_percent, 0) >= 100
             OR e.completed_at IS NOT NULL
        )::int AS completed_courses,

        COUNT(DISTINCT CASE
          WHEN LOWER(COALESCE(e.status, '')) IN ('learning', 'in_progress', 'active')
            OR COALESCE(e.progress_percent, 0) > 0
          THEN e.user_id
        END)::int AS active_learners

      FROM enrollments e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN courses c ON c.id = e.course_id
      LEFT JOIN departments d ON d.id = u.department_id
      ${enrollmentFilter};
    `;

    const topCoursesQuery = `
      WITH enrollment_base AS (
        SELECT
          c.id AS course_id,
          c.title AS course_name,
          e.id AS enrollment_id,
          e.user_id,
          e.progress_percent,
          e.status,
          e.completed_at
        FROM enrollments e
        LEFT JOIN users u ON u.id = e.user_id
        LEFT JOIN courses c ON c.id = e.course_id
        LEFT JOIN departments d ON d.id = u.department_id
        ${enrollmentFilter}
      ),
      score_by_user AS (
        SELECT
          qa.user_id,
          COALESCE(
            ROUND(
              AVG(
                CASE
                  WHEN qa.total_score > 0 
                    THEN (qa.score::numeric / qa.total_score::numeric) * 100
                  ELSE qa.score::numeric
                END
              ),
              2
            ),
            0
          ) AS avg_score
        FROM quiz_attempts qa
        GROUP BY qa.user_id
      )
      SELECT
        eb.course_id,
        eb.course_name,
        COUNT(DISTINCT eb.user_id)::int AS learners,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(eb.status, '')) IN ('completed', 'done', 'finished')
            OR COALESCE(eb.progress_percent, 0) >= 100
            OR eb.completed_at IS NOT NULL
        )::int AS completed_count,

        COUNT(eb.enrollment_id)::int AS total_enrollments,

        CASE
          WHEN COUNT(eb.enrollment_id) = 0 THEN 0
          ELSE ROUND(
            (
              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(eb.status, '')) IN ('completed', 'done', 'finished')
                  OR COALESCE(eb.progress_percent, 0) >= 100
                  OR eb.completed_at IS NOT NULL
              )::numeric / COUNT(eb.enrollment_id)::numeric
            ) * 100,
            2
          )
        END AS completion_rate,

        COALESCE(ROUND(AVG(sbu.avg_score), 2), 0) AS avg_score

      FROM enrollment_base eb
      LEFT JOIN score_by_user sbu ON sbu.user_id = eb.user_id
      WHERE eb.course_id IS NOT NULL
      GROUP BY eb.course_id, eb.course_name
      ORDER BY completion_rate DESC, learners DESC, eb.course_name ASC
      LIMIT 5;
    `;

    const remindersQuery = `
      SELECT
        u.id AS user_id,
        u.full_name AS user_name,
        COALESCE(d.name, 'Chưa có phòng ban') AS department_name,
        c.id AS course_id,
        c.title AS course_name,
        COALESCE(e.progress_percent, 0)::int AS progress,
        e.enrolled_at,
        e.completed_at,
        e.status
      FROM enrollments e
      INNER JOIN users u ON u.id = e.user_id
      INNER JOIN courses c ON c.id = e.course_id
      LEFT JOIN departments d ON d.id = u.department_id
      ${enrollmentFilter}
        AND COALESCE(e.progress_percent, 0) < 100
        AND e.completed_at IS NULL
        AND LOWER(COALESCE(e.status, 'learning')) IN (
          'learning',
          'in_progress',
          'active',
          'not_started'
        )
      ORDER BY e.enrolled_at ASC, e.progress_percent ASC, u.full_name ASC
      LIMIT 5;
    `;

    const [
      summaryResult,
      departmentResult,
      indicatorsResult,
      topCoursesResult,
      remindersResult,
    ] = await Promise.all([
      db.query(summaryQuery, values),
      db.query(departmentQuery, departmentValues),
      db.query(indicatorsQuery, values),
      db.query(topCoursesQuery, values),
      db.query(remindersQuery, values),
    ]);

    const summary = summaryResult.rows[0] || {};
    const indicators = indicatorsResult.rows[0] || {};

    return res.status(200).json({
      success: true,
      message: "Lấy báo cáo tổng quan học tập thành công",
      data: {
        cards: {
          totalLearners: Number(summary.total_learners || 0),
          totalCourses: Number(summary.total_courses || 0),
          completionRate: Number(summary.completion_rate || 0),
          certificatesIssued: Number(summary.total_certificates || 0),
        },

        departmentPerformance: departmentResult.rows.map((item) => ({
          departmentId: item.department_id,
          departmentName: item.department_name,
          totalUsers: Number(item.total_users || 0),
          completedUsers: Number(item.completed_users || 0),
          avgScore: Number(item.avg_score || 0),
          completionRate: Number(item.completion_rate || 0),
        })),

        indicators: {
          totalLearningHours: Number(
            (Number(indicators.total_learning_minutes || 0) / 60).toFixed(2)
          ),
          averageScore: Number(indicators.average_score || 0),
          completedCourses: Number(indicators.completed_courses || 0),
          activeLearners: Number(indicators.active_learners || 0),
        },

        topCourses: topCoursesResult.rows.map((item) => ({
          courseId: item.course_id,
          name: item.course_name,
          learners: Number(item.learners || 0),
          completion: Number(item.completion_rate || 0),
          score: Number(item.avg_score || 0),
        })),

        reminders: remindersResult.rows.map((item) => ({
          userId: item.user_id,
          name: item.user_name,
          department: item.department_name,
          courseId: item.course_id,
          course: item.course_name,
          progress: Number(item.progress || 0),
          deadline: formatDeadline(item.enrolled_at),
        })),
      },
    });
  } catch (error: any) {
    console.error("getLearningOverviewReport error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy báo cáo tổng quan học tập",
      error: error.message,
    });
  }
};

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
          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 0 
           AND EXTRACT(HOUR FROM lp.updated_at) < 2 THEN '00:00 - 02:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 2 
           AND EXTRACT(HOUR FROM lp.updated_at) < 4 THEN '02:00 - 04:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 4 
           AND EXTRACT(HOUR FROM lp.updated_at) < 6 THEN '04:00 - 06:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 6 
           AND EXTRACT(HOUR FROM lp.updated_at) < 8 THEN '06:00 - 08:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 8 
           AND EXTRACT(HOUR FROM lp.updated_at) < 10 THEN '08:00 - 10:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 10 
           AND EXTRACT(HOUR FROM lp.updated_at) < 12 THEN '10:00 - 12:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 12 
           AND EXTRACT(HOUR FROM lp.updated_at) < 14 THEN '12:00 - 14:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 14 
           AND EXTRACT(HOUR FROM lp.updated_at) < 16 THEN '14:00 - 16:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 16 
           AND EXTRACT(HOUR FROM lp.updated_at) < 18 THEN '16:00 - 18:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 18 
           AND EXTRACT(HOUR FROM lp.updated_at) < 20 THEN '18:00 - 20:00'

          WHEN EXTRACT(HOUR FROM lp.updated_at) >= 20 
           AND EXTRACT(HOUR FROM lp.updated_at) < 22 THEN '20:00 - 22:00'

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
      statusBreakdownResult,
      departmentsFilterResult,
    ] = await Promise.all([
      db.query(summaryQuery, values),
      db.query(departmentStudyTimeQuery, values),
      db.query(timeSlotQuery, values),
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

export const getReportFilters = async (_req: Request, res: Response) => {
  try {
    const departmentsQuery = `
      SELECT id, name
      FROM departments
      WHERE COALESCE(status, 'active') = 'active'
      ORDER BY name ASC;
    `;

    const coursesQuery = `
      SELECT id, title
      FROM courses
      WHERE COALESCE(status, '') <> 'deleted'
      ORDER BY title ASC;
    `;

    const [departmentsResult, coursesResult] = await Promise.all([
      db.query(departmentsQuery),
      db.query(coursesQuery),
    ]);

    return res.status(200).json({
      success: true,
      message: "Lấy bộ lọc báo cáo thành công",
      data: {
        periods: [
          { value: "month", label: "Tháng này" },
          { value: "quarter", label: "Quý này" },
          { value: "year", label: "Năm nay" },
          { value: "all", label: "Tất cả thời gian" },
        ],
        statuses: [
          { value: "all", label: "Tất cả trạng thái" },
          { value: "learning", label: "Đang học" },
          { value: "completed", label: "Hoàn thành" },
          { value: "not_started", label: "Chưa bắt đầu" },
        ],
        departments: departmentsResult.rows.map((item) => ({
          id: item.id,
          name: item.name,
        })),
        courses: coursesResult.rows.map((item) => ({
          id: item.id,
          title: item.title,
        })),
      },
    });
  } catch (error: any) {
    console.error("getReportFilters error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy bộ lọc báo cáo",
      error: error.message,
    });
  }
};