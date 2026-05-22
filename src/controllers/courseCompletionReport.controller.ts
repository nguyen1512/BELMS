import { Request, Response } from "express";
import { db } from "../config/db";

function buildDateFilter(period?: string) {
  switch (period) {
    case "today":
      return "AND ca.assigned_at >= CURRENT_DATE";
    case "week":
      return "AND ca.assigned_at >= date_trunc('week', CURRENT_DATE)";
    case "month":
      return "AND ca.assigned_at >= date_trunc('month', CURRENT_DATE)";
    case "quarter":
      return "AND ca.assigned_at >= date_trunc('quarter', CURRENT_DATE)";
    case "year":
      return "AND ca.assigned_at >= date_trunc('year', CURRENT_DATE)";
    default:
      return "";
  }
}

function normalizeStatus(status?: string) {
  if (!status || status === "all") return "";

  if (status === "completed") return "completed";
  if (status === "learning") return "learning";
  if (status === "overdue") return "overdue";
  if (status === "assigned") return "assigned";

  return "";
}

export const getCompletionSummary = async (req: Request, res: Response) => {
  try {
    const { period = "month", departmentId = "all", status = "all", search = "" } = req.query;

    const values: any[] = [];
    let index = 1;

    let where = "WHERE 1 = 1";
    where += ` ${buildDateFilter(String(period))}`;

    if (departmentId && departmentId !== "all") {
      values.push(departmentId);
      where += ` AND u.department_id = $${index++}`;
    }

    if (search) {
      values.push(`%${String(search).trim()}%`);
      where += ` AND (
        u.full_name ILIKE $${index}
        OR u.email ILIKE $${index}
        OR c.title ILIKE $${index}
        OR d.name ILIKE $${index}
      )`;
      index++;
    }

    const normalizedStatus = normalizeStatus(String(status));
    if (normalizedStatus === "completed") {
      where += ` AND (
        COALESCE(lp.status, e.status, ca.status) = 'completed'
        OR COALESCE(lp.progress_percent, e.progress_percent, 0) >= 100
        OR e.completed_at IS NOT NULL
        OR lp.completed_at IS NOT NULL
      )`;
    }

    if (normalizedStatus === "learning") {
      where += ` AND (
        COALESCE(lp.status, e.status, ca.status) IN ('learning', 'in_progress', 'started')
        OR (
          COALESCE(lp.progress_percent, e.progress_percent, 0) > 0
          AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100
        )
      )
      AND NOT (
        ca.due_date IS NOT NULL
        AND ca.due_date < CURRENT_DATE
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100
      )`;
    }

    if (normalizedStatus === "overdue") {
      where += ` AND ca.due_date IS NOT NULL
        AND ca.due_date < CURRENT_DATE
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100`;
    }

    if (normalizedStatus === "assigned") {
      where += ` AND COALESCE(lp.progress_percent, e.progress_percent, 0) = 0
        AND NOT (
          ca.due_date IS NOT NULL
          AND ca.due_date < CURRENT_DATE
        )`;
    }

    const query = `
      WITH base AS (
        SELECT
          ca.id AS assignment_id,
          ca.course_id,
          ca.assigned_to_user_id AS user_id,
          ca.due_date,
          ca.status AS assignment_status,
          ca.assigned_at,
          u.full_name,
          u.email,
          u.department_id,
          d.name AS department_name,
          c.title AS course_title,
          COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
          COALESCE(lp.status, e.status, ca.status, 'assigned') AS learning_status,
          COALESCE(lp.completed_at, e.completed_at) AS completed_at
        FROM course_assignments ca
        LEFT JOIN users u ON u.id = ca.assigned_to_user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN courses c ON c.id = ca.course_id
        LEFT JOIN learning_progress lp 
          ON lp.user_id = ca.assigned_to_user_id 
          AND lp.course_id = ca.course_id
        LEFT JOIN enrollments e 
          ON e.user_id = ca.assigned_to_user_id 
          AND e.course_id = ca.course_id
        ${where}
      )
      SELECT
        COUNT(*)::int AS total_assigned,
        COUNT(*) FILTER (
          WHERE progress_percent >= 100
          OR learning_status = 'completed'
          OR completed_at IS NOT NULL
        )::int AS completed,
        COUNT(*) FILTER (
          WHERE progress_percent > 0
          AND progress_percent < 100
          AND NOT (
            due_date IS NOT NULL
            AND due_date < CURRENT_DATE
          )
        )::int AS learning,
        COUNT(*) FILTER (
          WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND progress_percent < 100
        )::int AS overdue
      FROM base;
    `;

    const result = await db.query(query, values);

    const row = result.rows[0] || {
      total_assigned: 0,
      completed: 0,
      learning: 0,
      overdue: 0,
    };

    res.json({
      success: true,
      data: {
        totalAssigned: Number(row.total_assigned || 0),
        completed: Number(row.completed || 0),
        learning: Number(row.learning || 0),
        overdue: Number(row.overdue || 0),
      },
    });
  } catch (error) {
    console.error("getCompletionSummary error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu tổng quan hoàn thành khóa học",
    });
  }
};

export const getCompletionByCourses = async (req: Request, res: Response) => {
  try {
    const { period = "month", departmentId = "all", status = "all", search = "" } = req.query;

    const values: any[] = [];
    let index = 1;

    let where = "WHERE 1 = 1";
    where += ` ${buildDateFilter(String(period))}`;

    if (departmentId && departmentId !== "all") {
      values.push(departmentId);
      where += ` AND u.department_id = $${index++}`;
    }

    if (search) {
      values.push(`%${String(search).trim()}%`);
      where += ` AND (
        c.title ILIKE $${index}
        OR c.code ILIKE $${index}
        OR u.full_name ILIKE $${index}
        OR d.name ILIKE $${index}
      )`;
      index++;
    }

    const normalizedStatus = normalizeStatus(String(status));
    if (normalizedStatus === "completed") {
      where += ` AND (
        COALESCE(lp.progress_percent, e.progress_percent, 0) >= 100
        OR COALESCE(lp.status, e.status) = 'completed'
        OR lp.completed_at IS NOT NULL
        OR e.completed_at IS NOT NULL
      )`;
    }

    if (normalizedStatus === "learning") {
      where += ` AND COALESCE(lp.progress_percent, e.progress_percent, 0) > 0
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100`;
    }

    if (normalizedStatus === "overdue") {
      where += ` AND ca.due_date IS NOT NULL
        AND ca.due_date < CURRENT_DATE
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100`;
    }

    const query = `
      WITH base AS (
        SELECT
          ca.id AS assignment_id,
          ca.course_id,
          c.title AS course_title,
          c.code AS course_code,
          ca.due_date,
          COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
          COALESCE(lp.status, e.status, ca.status, 'assigned') AS learning_status,
          COALESCE(lp.completed_at, e.completed_at) AS completed_at,
          u.department_id,
          d.name AS department_name
        FROM course_assignments ca
        LEFT JOIN courses c ON c.id = ca.course_id
        LEFT JOIN users u ON u.id = ca.assigned_to_user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN learning_progress lp 
          ON lp.user_id = ca.assigned_to_user_id 
          AND lp.course_id = ca.course_id
        LEFT JOIN enrollments e 
          ON e.user_id = ca.assigned_to_user_id 
          AND e.course_id = ca.course_id
        ${where}
      )
      SELECT
        course_id,
        COALESCE(course_title, 'Khóa học chưa xác định') AS course_title,
        COALESCE(course_code, '') AS course_code,
        COUNT(*)::int AS total_assigned,
        COUNT(*) FILTER (
          WHERE progress_percent >= 100
          OR learning_status = 'completed'
          OR completed_at IS NOT NULL
        )::int AS completed_count,
        COUNT(*) FILTER (
          WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND progress_percent < 100
        )::int AS overdue_count,
        ROUND(
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE (
              COUNT(*) FILTER (
                WHERE progress_percent >= 100
                OR learning_status = 'completed'
                OR completed_at IS NOT NULL
              )::numeric / COUNT(*)::numeric
            ) * 100
          END,
          0
        )::int AS completion_rate
      FROM base
      GROUP BY course_id, course_title, course_code
      ORDER BY completion_rate DESC, total_assigned DESC
      LIMIT 20;
    `;

    const result = await db.query(query, values);

    const data = result.rows.map((row) => {
      const completionRate = Number(row.completion_rate || 0);
      const overdueCount = Number(row.overdue_count || 0);

      let statusLabel = "Ổn định";
      let statusType = "stable";

      if (overdueCount > 0 || completionRate < 70) {
        statusLabel = "Cảnh báo";
        statusType = "warning";
      }

      if (completionRate < 50) {
        statusLabel = "Cần nhắc";
        statusType = "danger";
      }

      return {
        courseId: row.course_id,
        courseTitle: row.course_title,
        courseCode: row.course_code,
        totalAssigned: Number(row.total_assigned || 0),
        completedCount: Number(row.completed_count || 0),
        overdueCount,
        completionRate,
        statusLabel,
        statusType,
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getCompletionByCourses error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy tỷ lệ hoàn thành theo khóa học",
    });
  }
};

export const getCompletionDetails = async (req: Request, res: Response) => {
  try {
    const {
      period = "month",
      departmentId = "all",
      status = "all",
      search = "",
      page = "1",
      limit = "10",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const offset = (pageNumber - 1) * limitNumber;

    const values: any[] = [];
    let index = 1;

    let where = "WHERE 1 = 1";
    where += ` ${buildDateFilter(String(period))}`;

    if (departmentId && departmentId !== "all") {
      values.push(departmentId);
      where += ` AND u.department_id = $${index++}`;
    }

    if (search) {
      values.push(`%${String(search).trim()}%`);
      where += ` AND (
        u.full_name ILIKE $${index}
        OR u.email ILIKE $${index}
        OR d.name ILIKE $${index}
        OR c.title ILIKE $${index}
      )`;
      index++;
    }

    const normalizedStatus = normalizeStatus(String(status));
    if (normalizedStatus === "completed") {
      where += ` AND (
        COALESCE(lp.progress_percent, e.progress_percent, 0) >= 100
        OR COALESCE(lp.status, e.status) = 'completed'
        OR lp.completed_at IS NOT NULL
        OR e.completed_at IS NOT NULL
      )`;
    }

    if (normalizedStatus === "learning") {
      where += ` AND COALESCE(lp.progress_percent, e.progress_percent, 0) > 0
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100
        AND NOT (
          ca.due_date IS NOT NULL
          AND ca.due_date < CURRENT_DATE
        )`;
    }

    if (normalizedStatus === "overdue") {
      where += ` AND ca.due_date IS NOT NULL
        AND ca.due_date < CURRENT_DATE
        AND COALESCE(lp.progress_percent, e.progress_percent, 0) < 100`;
    }

    if (normalizedStatus === "assigned") {
      where += ` AND COALESCE(lp.progress_percent, e.progress_percent, 0) = 0`;
    }

    const baseQuery = `
      FROM course_assignments ca
      LEFT JOIN users u ON u.id = ca.assigned_to_user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN learning_progress lp 
        ON lp.user_id = ca.assigned_to_user_id 
        AND lp.course_id = ca.course_id
      LEFT JOIN enrollments e 
        ON e.user_id = ca.assigned_to_user_id 
        AND e.course_id = ca.course_id
      LEFT JOIN certificates cert
        ON cert.user_id = ca.assigned_to_user_id
        AND cert.course_id = ca.course_id
      ${where}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      ${baseQuery}
    `;

    const dataQuery = `
      SELECT
        ca.id AS assignment_id,
        ca.course_id,
        c.title AS course_title,
        c.code AS course_code,
        ca.assigned_to_user_id AS user_id,
        u.full_name,
        u.email,
        d.name AS department_name,
        ca.assigned_at,
        ca.due_date,
        COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
        COALESCE(lp.status, e.status, ca.status, 'assigned') AS raw_status,
        COALESCE(lp.started_at, e.enrolled_at) AS started_at,
        COALESCE(lp.completed_at, e.completed_at) AS completed_at,
        cert.certificate_code,
        cert.issued_at AS certificate_issued_at,
        cert.status AS certificate_status
      ${baseQuery}
      ORDER BY ca.assigned_at DESC NULLS LAST
      LIMIT $${index++}
      OFFSET $${index++}
    `;

    const countResult = await db.query(countQuery, values);
    const dataResult = await db.query(dataQuery, [...values, limitNumber, offset]);

    const data = dataResult.rows.map((row) => {
      const progress = Number(row.progress_percent || 0);

      let displayStatus = "assigned";
      let displayStatusLabel = "Được giao";

      if (progress >= 100 || row.raw_status === "completed" || row.completed_at) {
        displayStatus = "completed";
        displayStatusLabel = "Đã hoàn thành";
      } else if (row.due_date && new Date(row.due_date) < new Date()) {
        displayStatus = "overdue";
        displayStatusLabel = "Quá hạn";
      } else if (progress > 0) {
        displayStatus = "learning";
        displayStatusLabel = "Đang học";
      }

      return {
        assignmentId: row.assignment_id,
        userId: row.user_id,
        fullName: row.full_name || "Chưa xác định",
        email: row.email || "",
        departmentName: row.department_name || "Chưa có phòng ban",
        courseId: row.course_id,
        courseTitle: row.course_title || "Khóa học chưa xác định",
        courseCode: row.course_code || "",
        assignedAt: row.assigned_at,
        dueDate: row.due_date,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        progressPercent: progress,
        status: displayStatus,
        statusLabel: displayStatusLabel,
        certificateCode: row.certificate_code,
        certificateIssuedAt: row.certificate_issued_at,
        certificateStatus: row.certificate_status,
        hasCertificate: Boolean(row.certificate_code),
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: Number(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(Number(countResult.rows[0]?.total || 0) / limitNumber),
      },
    });
  } catch (error) {
    console.error("getCompletionDetails error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách chi tiết hoàn thành khóa học",
    });
  }
};

export const getCompletionFilters = async (_req: Request, res: Response) => {
  try {
    const departmentsQuery = `
      SELECT 
        id,
        name,
        code
      FROM departments
      WHERE COALESCE(status, 'active') = 'active'
      ORDER BY name ASC;
    `;

    const coursesQuery = `
      SELECT
        id,
        title,
        code
      FROM courses
      WHERE COALESCE(status, 'published') <> 'deleted'
      ORDER BY title ASC;
    `;

    const [departmentsResult, coursesResult] = await Promise.all([
      db.query(departmentsQuery),
      db.query(coursesQuery),
    ]);

    res.json({
      success: true,
      data: {
        departments: departmentsResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
        })),
        courses: coursesResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          code: row.code,
        })),
        periods: [
          { value: "today", label: "Hôm nay" },
          { value: "week", label: "Tuần này" },
          { value: "month", label: "Tháng này" },
          { value: "quarter", label: "Quý này" },
          { value: "year", label: "Năm nay" },
          { value: "all", label: "Tất cả thời gian" },
        ],
        statuses: [
          { value: "all", label: "Tất cả trạng thái" },
          { value: "assigned", label: "Được giao" },
          { value: "learning", label: "Đang học" },
          { value: "completed", label: "Đã hoàn thành" },
          { value: "overdue", label: "Quá hạn" },
        ],
      },
    });
  } catch (error) {
    console.error("getCompletionFilters error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu bộ lọc",
    });
  }
};

export const getCertificateConditions = async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE is_required = true)::int AS required_lessons,
        COUNT(*)::int AS total_lessons
      FROM lessons;
    `;

    const quizQuery = `
      SELECT
        COALESCE(ROUND(AVG(pass_score), 0), 80)::int AS average_pass_score,
        COUNT(*)::int AS total_quizzes
      FROM quizzes;
    `;

    const [lessonResult, quizResult] = await Promise.all([
      db.query(query),
      db.query(quizQuery),
    ]);

    const lessonRow = lessonResult.rows[0];
    const quizRow = quizResult.rows[0];

    res.json({
      success: true,
      data: [
        {
          id: "lesson_completion",
          title: "Hoàn thành bài học",
          description: "Người học cần hoàn thành 100% bài học bắt buộc.",
          value: Number(lessonRow?.required_lessons || 0),
          total: Number(lessonRow?.total_lessons || 0),
          type: "lesson",
        },
        {
          id: "quiz_score",
          title: "Đạt điểm kiểm tra",
          description: `Điểm quiz hoặc bài kiểm tra cuối khóa cần đạt tối thiểu ${Number(
            quizRow?.average_pass_score || 80
          )}.`,
          value: Number(quizRow?.average_pass_score || 80),
          total: Number(quizRow?.total_quizzes || 0),
          type: "quiz",
        },
      ],
    });
  } catch (error) {
    console.error("getCertificateConditions error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy điều kiện cấp chứng chỉ",
    });
  }
};

export const getCompletionReportOverview = async (req: Request, res: Response) => {
  try {
    const fakeReq = req;

    const { period = "month", departmentId = "all", status = "all", search = "" } = req.query;

    const values: any[] = [];
    let index = 1;

    let where = "WHERE 1 = 1";
    where += ` ${buildDateFilter(String(period))}`;

    if (departmentId && departmentId !== "all") {
      values.push(departmentId);
      where += ` AND u.department_id = $${index++}`;
    }

    if (search) {
      values.push(`%${String(search).trim()}%`);
      where += ` AND (
        u.full_name ILIKE $${index}
        OR u.email ILIKE $${index}
        OR c.title ILIKE $${index}
        OR d.name ILIKE $${index}
      )`;
      index++;
    }

    const summaryQuery = `
      WITH base AS (
        SELECT
          ca.id,
          ca.due_date,
          COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
          COALESCE(lp.status, e.status, ca.status, 'assigned') AS learning_status,
          COALESCE(lp.completed_at, e.completed_at) AS completed_at
        FROM course_assignments ca
        LEFT JOIN users u ON u.id = ca.assigned_to_user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN courses c ON c.id = ca.course_id
        LEFT JOIN learning_progress lp 
          ON lp.user_id = ca.assigned_to_user_id 
          AND lp.course_id = ca.course_id
        LEFT JOIN enrollments e 
          ON e.user_id = ca.assigned_to_user_id 
          AND e.course_id = ca.course_id
        ${where}
      )
      SELECT
        COUNT(*)::int AS total_assigned,
        COUNT(*) FILTER (
          WHERE progress_percent >= 100
          OR learning_status = 'completed'
          OR completed_at IS NOT NULL
        )::int AS completed,
        COUNT(*) FILTER (
          WHERE progress_percent > 0
          AND progress_percent < 100
          AND NOT (
            due_date IS NOT NULL
            AND due_date < CURRENT_DATE
          )
        )::int AS learning,
        COUNT(*) FILTER (
          WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND progress_percent < 100
        )::int AS overdue
      FROM base;
    `;

    const coursesQuery = `
      WITH base AS (
        SELECT
          ca.course_id,
          c.title AS course_title,
          c.code AS course_code,
          ca.due_date,
          COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
          COALESCE(lp.status, e.status, ca.status, 'assigned') AS learning_status,
          COALESCE(lp.completed_at, e.completed_at) AS completed_at
        FROM course_assignments ca
        LEFT JOIN courses c ON c.id = ca.course_id
        LEFT JOIN users u ON u.id = ca.assigned_to_user_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN learning_progress lp 
          ON lp.user_id = ca.assigned_to_user_id 
          AND lp.course_id = ca.course_id
        LEFT JOIN enrollments e 
          ON e.user_id = ca.assigned_to_user_id 
          AND e.course_id = ca.course_id
        ${where}
      )
      SELECT
        course_id,
        COALESCE(course_title, 'Khóa học chưa xác định') AS course_title,
        COALESCE(course_code, '') AS course_code,
        COUNT(*)::int AS total_assigned,
        COUNT(*) FILTER (
          WHERE progress_percent >= 100
          OR learning_status = 'completed'
          OR completed_at IS NOT NULL
        )::int AS completed_count,
        COUNT(*) FILTER (
          WHERE due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND progress_percent < 100
        )::int AS overdue_count,
        ROUND(
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE (
              COUNT(*) FILTER (
                WHERE progress_percent >= 100
                OR learning_status = 'completed'
                OR completed_at IS NOT NULL
              )::numeric / COUNT(*)::numeric
            ) * 100
          END,
          0
        )::int AS completion_rate
      FROM base
      GROUP BY course_id, course_title, course_code
      ORDER BY completion_rate DESC, total_assigned DESC
      LIMIT 10;
    `;

    const conditionsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE is_required = true)::int AS required_lessons,
        COUNT(*)::int AS total_lessons
      FROM lessons;
    `;

    const quizQuery = `
      SELECT
        COALESCE(ROUND(AVG(pass_score), 0), 80)::int AS average_pass_score,
        COUNT(*)::int AS total_quizzes
      FROM quizzes;
    `;

    const [summaryResult, coursesResult, conditionsResult, quizResult] = await Promise.all([
      db.query(summaryQuery, values),
      db.query(coursesQuery, values),
      db.query(conditionsQuery),
      db.query(quizQuery),
    ]);

    const summaryRow = summaryResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        summary: {
          totalAssigned: Number(summaryRow.total_assigned || 0),
          completed: Number(summaryRow.completed || 0),
          learning: Number(summaryRow.learning || 0),
          overdue: Number(summaryRow.overdue || 0),
        },
        courses: coursesResult.rows.map((row) => {
          const completionRate = Number(row.completion_rate || 0);
          const overdueCount = Number(row.overdue_count || 0);

          let statusLabel = "Ổn định";
          let statusType = "stable";

          if (overdueCount > 0 || completionRate < 70) {
            statusLabel = "Cảnh báo";
            statusType = "warning";
          }

          if (completionRate < 50) {
            statusLabel = "Cần nhắc";
            statusType = "danger";
          }

          return {
            courseId: row.course_id,
            courseTitle: row.course_title,
            courseCode: row.course_code,
            totalAssigned: Number(row.total_assigned || 0),
            completedCount: Number(row.completed_count || 0),
            overdueCount,
            completionRate,
            statusLabel,
            statusType,
          };
        }),
        certificateConditions: [
          {
            id: "lesson_completion",
            title: "Hoàn thành bài học",
            description: "Người học cần hoàn thành 100% bài học bắt buộc.",
            value: Number(conditionsResult.rows[0]?.required_lessons || 0),
            total: Number(conditionsResult.rows[0]?.total_lessons || 0),
            type: "lesson",
          },
          {
            id: "quiz_score",
            title: "Đạt điểm kiểm tra",
            description: `Điểm quiz hoặc bài kiểm tra cuối khóa cần đạt tối thiểu ${Number(
              quizResult.rows[0]?.average_pass_score || 80
            )}.`,
            value: Number(quizResult.rows[0]?.average_pass_score || 80),
            total: Number(quizResult.rows[0]?.total_quizzes || 0),
            type: "quiz",
          },
        ],
      },
    });
  } catch (error) {
    console.error("getCompletionReportOverview error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu báo cáo hoàn thành khóa học",
    });
  }
};