import { Request, Response } from "express";
import { db } from "../config/db";

type RankingPeriod =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all";

type RankingSort =
  | "score_desc"
  | "score_asc"
  | "hours_desc"
  | "certificates_desc"
  | "completion_desc"
  | "progress_desc";

function safeNumber(value: any, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getPeriodCondition(period: RankingPeriod, alias: string, dateColumn: string) {
  const col = `${alias}.${dateColumn}`;

  switch (period) {
    case "this_month":
      return `AND ${col} >= date_trunc('month', CURRENT_DATE)`;
    case "last_month":
      return `
        AND ${col} >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
        AND ${col} < date_trunc('month', CURRENT_DATE)
      `;
    case "this_quarter":
      return `AND ${col} >= date_trunc('quarter', CURRENT_DATE)`;
    case "this_year":
      return `AND ${col} >= date_trunc('year', CURRENT_DATE)`;
    case "all":
    default:
      return "";
  }
}

function getOrderBy(sort: RankingSort) {
  switch (sort) {
    case "score_asc":
      return "learning_score ASC, average_progress DESC";
    case "hours_desc":
      return "learning_hours DESC, learning_score DESC";
    case "certificates_desc":
      return "certificates_count DESC, learning_score DESC";
    case "completion_desc":
      return "completion_rate DESC, learning_score DESC";
    case "progress_desc":
      return "average_progress DESC, learning_score DESC";
    case "score_desc":
    default:
      return "learning_score DESC, average_progress DESC";
  }
}

function getStatusLabel(score: number, completion: number, progress: number) {
  if (score >= 85 && completion >= 70) return "Xuất sắc";
  if (score >= 70 && progress >= 60) return "Tốt";
  if (score >= 50 || progress >= 40) return "Đang học";
  return "Cần cải thiện";
}

function buildBaseRankingQuery(period: RankingPeriod, extraWhere = "") {
  const learningProgressPeriod = getPeriodCondition(period, "lp", "created_at");
  const lessonProgressPeriod = getPeriodCondition(period, "lsp", "created_at");
  const quizPeriod = getPeriodCondition(period, "qa", "submitted_at");
  const certificatePeriod = getPeriodCondition(period, "cert", "issued_at");

  return `
    WITH progress_data AS (
      SELECT
        lp.user_id,
        AVG(COALESCE(lp.progress_percent, 0)) AS average_progress,
        COUNT(DISTINCT lp.course_id) AS total_courses,
        COUNT(
          DISTINCT CASE
            WHEN LOWER(COALESCE(lp.status, '')) IN ('completed', 'complete', 'done')
              OR COALESCE(lp.progress_percent, 0) >= 100
            THEN lp.course_id
          END
        ) AS completed_courses
      FROM learning_progress lp
      WHERE 1 = 1
      ${learningProgressPeriod}
      GROUP BY lp.user_id
    ),

    lesson_time_data AS (
      SELECT
        lsp.user_id,
        SUM(COALESCE(lsp.watched_minutes, 0)) AS total_watched_minutes
      FROM lesson_progress lsp
      WHERE 1 = 1
      ${lessonProgressPeriod}
      GROUP BY lsp.user_id
    ),

    quiz_score_data AS (
      SELECT
        qa.user_id,
        AVG(
          CASE
            WHEN COALESCE(qa.total_score, 0) > 0
            THEN (qa.score::numeric / qa.total_score::numeric) * 100
            ELSE COALESCE(qa.score, 0)::numeric
          END
        ) AS average_quiz_score,
        COUNT(qa.id) AS total_quiz_attempts,
        COUNT(CASE WHEN qa.passed = true THEN 1 END) AS passed_quizzes
      FROM quiz_attempts qa
      WHERE 1 = 1
      ${quizPeriod}
      GROUP BY qa.user_id
    ),

    certificate_data AS (
      SELECT
        cert.user_id,
        COUNT(cert.id) AS certificates_count
      FROM certificates cert
      WHERE COALESCE(cert.status, 'active') != 'deleted'
      ${certificatePeriod}
      GROUP BY cert.user_id
    ),

    ranking_base AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.full_name, u.email, 'Chưa có tên') AS employee_name,
        u.email,
        u.department_id,
        COALESCE(d.name, 'Chưa có phòng ban') AS department_name,

        ROUND(COALESCE(pd.average_progress, 0)::numeric, 1) AS average_progress,

        COALESCE(pd.total_courses, 0) AS total_courses,
        COALESCE(pd.completed_courses, 0) AS completed_courses,

        ROUND(
          CASE
            WHEN COALESCE(pd.total_courses, 0) > 0
            THEN (pd.completed_courses::numeric / pd.total_courses::numeric) * 100
            ELSE 0
          END,
          0
        ) AS completion_rate,

        ROUND(
          COALESCE(ltd.total_watched_minutes, 0)::numeric / 60,
          1
        ) AS learning_hours,

        ROUND(COALESCE(qsd.average_quiz_score, 0)::numeric, 1) AS average_quiz_score,
        COALESCE(qsd.total_quiz_attempts, 0) AS total_quiz_attempts,
        COALESCE(qsd.passed_quizzes, 0) AS passed_quizzes,

        COALESCE(cd.certificates_count, 0) AS certificates_count,

        ROUND(
          (
            COALESCE(qsd.average_quiz_score, 0) * 0.5
            + COALESCE(pd.average_progress, 0) * 0.3
            + (
                CASE
                  WHEN COALESCE(pd.total_courses, 0) > 0
                  THEN (pd.completed_courses::numeric / pd.total_courses::numeric) * 100
                  ELSE 0
                END
              ) * 0.2
          )::numeric,
          0
        ) AS learning_score

      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN progress_data pd ON pd.user_id = u.id
      LEFT JOIN lesson_time_data ltd ON ltd.user_id = u.id
      LEFT JOIN quiz_score_data qsd ON qsd.user_id = u.id
      LEFT JOIN certificate_data cd ON cd.user_id = u.id

      WHERE COALESCE(u.status, 'active') != 'deleted'
      ${extraWhere}
    )
  `;
}

export async function getRankingSummary(req: Request, res: Response) {
  try {
    const period = (req.query.period as RankingPeriod) || "this_month";
    const departmentId = String(req.query.department_id || "all");

    const params: any[] = [];
    let extraWhere = "";

    if (departmentId !== "all") {
      params.push(departmentId);
      extraWhere += ` AND u.department_id = $${params.length}`;
    }

    const query = `
      ${buildBaseRankingQuery(period, extraWhere)}
      SELECT
        COUNT(user_id) AS ranked_employees,
        ROUND(COALESCE(AVG(learning_score), 0)::numeric, 0) AS average_score,
        COALESCE(SUM(certificates_count), 0) AS issued_certificates,
        ROUND(COALESCE(AVG(completion_rate), 0)::numeric, 0) AS average_completion,
        ROUND(COALESCE(SUM(learning_hours), 0)::numeric, 1) AS total_learning_hours
      FROM ranking_base;
    `;

    const result = await db.query(query, params);
    const row = result.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        rankedEmployees: safeNumber(row.ranked_employees),
        averageScore: safeNumber(row.average_score),
        issuedCertificates: safeNumber(row.issued_certificates),
        averageCompletion: safeNumber(row.average_completion),
        totalLearningHours: safeNumber(row.total_learning_hours),
      },
    });
  } catch (error: any) {
    console.error("getRankingSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu tổng quan xếp hạng",
      error: error.message,
    });
  }
}

export async function getRankingEmployees(req: Request, res: Response) {
  try {
    const search = String(req.query.search || "").trim();
    const period = (req.query.period as RankingPeriod) || "this_month";
    const departmentId = String(req.query.department_id || "all");
    const sort = (req.query.sort as RankingSort) || "score_desc";

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const offset = (page - 1) * limit;

    const params: any[] = [];
    let extraWhere = "";

    if (search) {
      params.push(`%${search}%`);
      extraWhere += `
        AND (
          u.full_name ILIKE $${params.length}
          OR u.email ILIKE $${params.length}
          OR d.name ILIKE $${params.length}
        )
      `;
    }

    if (departmentId !== "all") {
      params.push(departmentId);
      extraWhere += ` AND u.department_id = $${params.length}`;
    }

    const orderBy = getOrderBy(sort);

    params.push(limit);
    const limitIndex = params.length;

    params.push(offset);
    const offsetIndex = params.length;

    const query = `
      ${buildBaseRankingQuery(period, extraWhere)}
      SELECT
        ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rank,
        *
      FROM ranking_base
      ORDER BY ${orderBy}
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex};
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE COALESCE(u.status, 'active') != 'deleted'
      ${extraWhere};
    `;

    const dataResult = await db.query(query, params);
    const countResult = await db.query(countQuery, params.slice(0, -2));

    const employees = dataResult.rows.map((row) => {
      const score = safeNumber(row.learning_score);
      const completion = safeNumber(row.completion_rate);
      const progress = safeNumber(row.average_progress);

      return {
        rank: safeNumber(row.rank),
        userId: row.user_id,
        employeeName: row.employee_name,
        email: row.email,
        departmentId: row.department_id,
        departmentName: row.department_name,

        learningScore: score,
        averageQuizScore: safeNumber(row.average_quiz_score),
        averageProgress: progress,
        completionRate: completion,
        learningHours: safeNumber(row.learning_hours),

        totalCourses: safeNumber(row.total_courses),
        completedCourses: safeNumber(row.completed_courses),
        certificatesCount: safeNumber(row.certificates_count),
        totalQuizAttempts: safeNumber(row.total_quiz_attempts),
        passedQuizzes: safeNumber(row.passed_quizzes),

        status: getStatusLabel(score, completion, progress),
      };
    });

    const total = safeNumber(countResult.rows[0]?.total);

    return res.status(200).json({
      success: true,
      data: employees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("getRankingEmployees error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy bảng xếp hạng nhân viên",
      error: error.message,
    });
  }
}

export async function getTopRankingEmployees(req: Request, res: Response) {
  try {
    const period = (req.query.period as RankingPeriod) || "this_month";
    const departmentId = String(req.query.department_id || "all");
    const limit = Math.min(Math.max(Number(req.query.limit || 3), 1), 10);

    const params: any[] = [];
    let extraWhere = "";

    if (departmentId !== "all") {
      params.push(departmentId);
      extraWhere += ` AND u.department_id = $${params.length}`;
    }

    params.push(limit);
    const limitIndex = params.length;

    const query = `
      ${buildBaseRankingQuery(period, extraWhere)}
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY learning_score DESC, average_progress DESC, completion_rate DESC
        ) AS rank,
        *
      FROM ranking_base
      ORDER BY learning_score DESC, average_progress DESC, completion_rate DESC
      LIMIT $${limitIndex};
    `;

    const result = await db.query(query, params);

    const topEmployees = result.rows.map((row) => ({
      rank: safeNumber(row.rank),
      userId: row.user_id,
      employeeName: row.employee_name,
      departmentName: row.department_name,
      learningScore: safeNumber(row.learning_score),
      averageProgress: safeNumber(row.average_progress),
      completionRate: safeNumber(row.completion_rate),
      learningHours: safeNumber(row.learning_hours),
      certificatesCount: safeNumber(row.certificates_count),
    }));

    return res.status(200).json({
      success: true,
      data: topEmployees,
    });
  } catch (error: any) {
    console.error("getTopRankingEmployees error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy top nhân viên nổi bật",
      error: error.message,
    });
  }
}

export async function exportRankingEmployees(req: Request, res: Response) {
  try {
    const period = (req.query.period as RankingPeriod) || "this_month";
    const departmentId = String(req.query.department_id || "all");
    const search = String(req.query.search || "").trim();

    const params: any[] = [];
    let extraWhere = "";

    if (search) {
      params.push(`%${search}%`);
      extraWhere += `
        AND (
          u.full_name ILIKE $${params.length}
          OR u.email ILIKE $${params.length}
          OR d.name ILIKE $${params.length}
        )
      `;
    }

    if (departmentId !== "all") {
      params.push(departmentId);
      extraWhere += ` AND u.department_id = $${params.length}`;
    }

    const query = `
      ${buildBaseRankingQuery(period, extraWhere)}
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY learning_score DESC, average_progress DESC
        ) AS rank,
        *
      FROM ranking_base
      ORDER BY learning_score DESC, average_progress DESC;
    `;

    const result = await db.query(query, params);

    const header = [
      "Hang",
      "Nhan vien",
      "Email",
      "Phong ban",
      "Diem xep hang",
      "Diem quiz TB",
      "Tien do TB (%)",
      "Hoan thanh (%)",
      "Gio hoc",
      "Khoa da hoan thanh",
      "Tong khoa",
      "Chung chi",
      "Bai quiz da lam",
      "Quiz dat",
      "Trang thai",
    ];

    const rows = result.rows.map((row) => {
      const score = safeNumber(row.learning_score);
      const completion = safeNumber(row.completion_rate);
      const progress = safeNumber(row.average_progress);

      return [
        row.rank,
        row.employee_name,
        row.email,
        row.department_name,
        row.learning_score,
        row.average_quiz_score,
        row.average_progress,
        row.completion_rate,
        row.learning_hours,
        row.completed_courses,
        row.total_courses,
        row.certificates_count,
        row.total_quiz_attempts,
        row.passed_quizzes,
        getStatusLabel(score, completion, progress),
      ];
    });

    const csvContent = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="learning-ranking-${Date.now()}.csv"`
    );

    return res.status(200).send("\uFEFF" + csvContent);
  } catch (error: any) {
    console.error("exportRankingEmployees error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể xuất bảng xếp hạng",
      error: error.message,
    });
  }
}