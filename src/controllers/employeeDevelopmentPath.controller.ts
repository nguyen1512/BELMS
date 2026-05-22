import { Request, Response } from "express";
import { db } from "../config/db";

const ACTIVE_PATH_STATUSES = ["active", "published", "draft"];
const ACTIVE_COURSE_STATUSES = ["active", "published", "draft"];

const safeNumber = (value: any, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeUuid = (value: any): string | null => {
  if (!value) return null;

  const text = String(value).trim();

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(text) ? text : null;
};

const getUserIdFromRequest = (req: Request): string | null => {
  const queryUserId = req.query.userId;
  const headerUserId = req.headers["x-user-id"];

  return normalizeUuid(queryUserId || headerUserId);
};

const normalizeProgress = (value: any): number => {
  const progress = safeNumber(value, 0);

  if (progress < 0) return 0;
  if (progress > 100) return 100;

  return Math.round(progress);
};

const normalizeDurationMinutes = (value: any): string => {
  const minutes = safeNumber(value, 0);

  if (minutes <= 0) return "Chưa cập nhật";

  if (minutes < 60) {
    return `${minutes} phút`;
  }

  const hours = minutes / 60;

  if (Number.isInteger(hours)) {
    return `${hours} giờ`;
  }

  return `${Number(hours.toFixed(1))} giờ`;
};

const calcLevel = (completedCourses: number): number => {
  if (completedCourses >= 10) return 4;
  if (completedCourses >= 6) return 3;
  if (completedCourses >= 2) return 2;
  return 1;
};

const getUserProfile = async (userId: string | null) => {
  if (!userId) return null;

  const result = await db.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.department_id,
      u.position,
      d.name AS department_name,
      d.code AS department_code
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const getSelectedLearningPath = async (userId: string | null) => {
  const profile = await getUserProfile(userId);

  const departmentName = profile?.department_name || null;
  const departmentCode = profile?.department_code || null;
  const userPosition = profile?.position || null;

  if (userId) {
    const assignedResult = await db.query(
      `
      SELECT DISTINCT
        lp.id,
        COALESCE(lp.title, lp.name) AS title,
        lp.name,
        lp.code,
        lp.description,
        lp.objective,
        lp.department,
        lp.target_role,
        lp.type,
        lp.deadline,
        lp.status,
        lp.created_at,
        CASE
          WHEN lpa.user_id = $1 THEN 1
          WHEN $2::text IS NOT NULL AND LOWER(COALESCE(lpa.department, '')) = LOWER($2::text) THEN 2
          WHEN $3::text IS NOT NULL AND LOWER(COALESCE(lpa.department, '')) = LOWER($3::text) THEN 3
          WHEN $2::text IS NOT NULL AND LOWER(COALESCE(lp.department, '')) = LOWER($2::text) THEN 4
          WHEN $3::text IS NOT NULL AND LOWER(COALESCE(lp.department, '')) = LOWER($3::text) THEN 5
          ELSE 9
        END AS match_priority
      FROM learning_paths lp
      LEFT JOIN learning_path_assignments lpa
        ON lpa.learning_path_id = lp.id
       AND COALESCE(lpa.status, 'assigned') IN ('assigned', 'active', 'learning')
      WHERE COALESCE(lp.status, 'active') = ANY($4::text[])
        AND (
          lpa.user_id = $1
          OR ($2::text IS NOT NULL AND LOWER(COALESCE(lpa.department, '')) = LOWER($2::text))
          OR ($3::text IS NOT NULL AND LOWER(COALESCE(lpa.department, '')) = LOWER($3::text))
          OR ($2::text IS NOT NULL AND LOWER(COALESCE(lp.department, '')) = LOWER($2::text))
          OR ($3::text IS NOT NULL AND LOWER(COALESCE(lp.department, '')) = LOWER($3::text))
          OR ($5::text IS NOT NULL AND LOWER(COALESCE(lp.target_role, '')) = LOWER($5::text))
        )
      ORDER BY match_priority ASC, lp.created_at DESC NULLS LAST
      LIMIT 1
      `,
      [
        userId,
        departmentName,
        departmentCode,
        ACTIVE_PATH_STATUSES,
        userPosition,
      ]
    );

    if (assignedResult.rows[0]) {
      return {
        profile,
        path: assignedResult.rows[0],
      };
    }
  }

  const fallbackResult = await db.query(
    `
    SELECT
      lp.id,
      COALESCE(lp.title, lp.name) AS title,
      lp.name,
      lp.code,
      lp.description,
      lp.objective,
      lp.department,
      lp.target_role,
      lp.type,
      lp.deadline,
      lp.status,
      lp.created_at
    FROM learning_paths lp
    WHERE COALESCE(lp.status, 'active') = ANY($1::text[])
    ORDER BY lp.created_at DESC NULLS LAST
    LIMIT 1
    `,
    [ACTIVE_PATH_STATUSES]
  );

  return {
    profile,
    path: fallbackResult.rows[0] || null,
  };
};

const getPathCourses = async (userId: string | null, learningPathId: string | null) => {
  if (!learningPathId) {
    const result = await db.query(
      `
      SELECT
        c.id,
        c.title,
        COALESCE(c.description, '') AS description,
        COALESCE(c.level, 'Cơ bản') AS level,
        COALESCE(c.duration_minutes, 0) AS duration_minutes,
        COALESCE(c.status, 'draft') AS status,
        COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
        COALESCE(lp.status, e.status, 'not_started') AS learning_status,
        COUNT(l.id) AS lesson_count,
        NULL::uuid AS learning_path_level_id,
        NULL::int AS level_number,
        NULL::text AS level_position,
        NULL::text AS level_competency,
        9999 AS sort_order
      FROM courses c
      LEFT JOIN LATERAL (
        SELECT
          MAX(progress_percent) AS progress_percent,
          MAX(status) AS status
        FROM learning_progress
        WHERE user_id = $1::uuid
          AND course_id = c.id
      ) lp ON $1::uuid IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT
          MAX(progress_percent) AS progress_percent,
          MAX(status) AS status
        FROM enrollments
        WHERE user_id = $1::uuid
          AND course_id = c.id
      ) e ON $1::uuid IS NOT NULL
      LEFT JOIN lessons l ON l.course_id = c.id
      WHERE COALESCE(c.status, 'draft') = ANY($2::text[])
      GROUP BY
        c.id,
        c.title,
        c.description,
        c.level,
        c.duration_minutes,
        c.status,
        lp.progress_percent,
        e.progress_percent,
        lp.status,
        e.status
      ORDER BY c.created_at DESC NULLS LAST
      LIMIT 6
      `,
      [userId, ACTIVE_COURSE_STATUSES]
    );

    return result.rows;
  }

  const result = await db.query(
    `
    WITH path_courses_raw AS (
      SELECT
        lpi.course_id,
        lpi.sort_order,
        NULL::uuid AS learning_path_level_id,
        NULL::int AS level_number,
        NULL::text AS level_position,
        NULL::text AS level_competency
      FROM learning_path_items lpi
      WHERE lpi.learning_path_id = $2::uuid
        AND lpi.course_id IS NOT NULL

      UNION ALL

      SELECT
        lplc.course_id,
        lpl.level_number AS sort_order,
        lpl.id AS learning_path_level_id,
        lpl.level_number,
        lpl.position AS level_position,
        lpl.competency AS level_competency
      FROM learning_path_levels lpl
      INNER JOIN learning_path_level_courses lplc
        ON lplc.learning_path_level_id = lpl.id
      WHERE lpl.learning_path_id = $2::uuid
    ),
    path_courses AS (
      SELECT DISTINCT ON (course_id)
        course_id,
        sort_order,
        learning_path_level_id,
        level_number,
        level_position,
        level_competency
      FROM path_courses_raw
      ORDER BY course_id, sort_order ASC NULLS LAST
    )
    SELECT
      c.id,
      c.title,
      COALESCE(c.description, '') AS description,
      COALESCE(c.level, 'Cơ bản') AS level,
      COALESCE(c.duration_minutes, 0) AS duration_minutes,
      COALESCE(c.status, 'draft') AS status,
      COALESCE(lp.progress_percent, e.progress_percent, 0) AS progress_percent,
      COALESCE(lp.status, e.status, 'not_started') AS learning_status,
      COUNT(l.id) AS lesson_count,
      pc.learning_path_level_id,
      pc.level_number,
      pc.level_position,
      pc.level_competency,
      COALESCE(pc.sort_order, 9999) AS sort_order
    FROM path_courses pc
    INNER JOIN courses c ON c.id = pc.course_id
    LEFT JOIN LATERAL (
      SELECT
        MAX(progress_percent) AS progress_percent,
        MAX(status) AS status
      FROM learning_progress
      WHERE user_id = $1::uuid
        AND course_id = c.id
    ) lp ON $1::uuid IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        MAX(progress_percent) AS progress_percent,
        MAX(status) AS status
      FROM enrollments
      WHERE user_id = $1::uuid
        AND course_id = c.id
    ) e ON $1::uuid IS NOT NULL
    LEFT JOIN lessons l ON l.course_id = c.id
    WHERE COALESCE(c.status, 'draft') = ANY($3::text[])
    GROUP BY
      c.id,
      c.title,
      c.description,
      c.level,
      c.duration_minutes,
      c.status,
      lp.progress_percent,
      e.progress_percent,
      lp.status,
      e.status,
      pc.learning_path_level_id,
      pc.level_number,
      pc.level_position,
      pc.level_competency,
      pc.sort_order
    ORDER BY COALESCE(pc.sort_order, 9999), c.created_at DESC NULLS LAST
    `,
    [userId, learningPathId, ACTIVE_COURSE_STATUSES]
  );

  return result.rows;
};

const getPathLevels = async (userId: string | null, learningPathId: string | null) => {
  if (!learningPathId) return [];

  const result = await db.query(
    `
    SELECT
      lpl.id,
      lpl.level_number,
      lpl.position,
      lpl.competency,
      COUNT(c.id) AS total_courses,
      COALESCE(ROUND(AVG(COALESCE(lp.progress_percent, e.progress_percent, 0))), 0) AS avg_progress,
      COUNT(c.id) FILTER (
        WHERE COALESCE(lp.progress_percent, e.progress_percent, 0) >= 100
           OR LOWER(COALESCE(lp.status, e.status, '')) IN ('completed', 'done', 'finished')
      ) AS completed_courses
    FROM learning_path_levels lpl
    LEFT JOIN learning_path_level_courses lplc
      ON lplc.learning_path_level_id = lpl.id
    LEFT JOIN courses c
      ON c.id = lplc.course_id
     AND COALESCE(c.status, 'draft') = ANY($3::text[])
    LEFT JOIN LATERAL (
      SELECT
        MAX(progress_percent) AS progress_percent,
        MAX(status) AS status
      FROM learning_progress
      WHERE user_id = $1::uuid
        AND course_id = c.id
    ) lp ON $1::uuid IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        MAX(progress_percent) AS progress_percent,
        MAX(status) AS status
      FROM enrollments
      WHERE user_id = $1::uuid
        AND course_id = c.id
    ) e ON $1::uuid IS NOT NULL
    WHERE lpl.learning_path_id = $2::uuid
    GROUP BY
      lpl.id,
      lpl.level_number,
      lpl.position,
      lpl.competency
    ORDER BY lpl.level_number ASC
    `,
    [userId, learningPathId, ACTIVE_COURSE_STATUSES]
  );

  return result.rows;
};

const getCertificateCount = async (
  userId: string | null,
  fallback: number
): Promise<number> => {
  if (!userId) return fallback;

  try {
    const result = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM certificates
      WHERE user_id = $1
      `,
      [userId]
    );

    return safeNumber(result.rows[0]?.total, fallback);
  } catch {
    return fallback;
  }
};

const buildRoadmap = (path: any, courses: any[], levels: any[]) => {
  if (levels.length > 0) {
    return levels.map((level: any) => {
      const totalCourses = safeNumber(level.total_courses);
      const completedCourses = safeNumber(level.completed_courses);
      const avgProgress = normalizeProgress(level.avg_progress);

      let status = "pending";

      if (totalCourses > 0 && completedCourses >= totalCourses) {
        status = "completed";
      } else if (avgProgress > 0) {
        status = "in_progress";
      }

      return {
        id: level.id,
        title: `Level ${level.level_number} - ${level.position}`,
        description: level.competency || "Chưa cập nhật năng lực cần đạt.",
        status,
        progress: avgProgress,
        totalCourses,
        completedCourses,
      };
    });
  }

  if (courses.length > 0) {
    return courses.map((course: any) => {
      const progress = normalizeProgress(course.progress_percent);
      const learningStatus = String(course.learning_status || "").toLowerCase();

      let status = "pending";

      if (progress >= 100 || ["completed", "done", "finished"].includes(learningStatus)) {
        status = "completed";
      } else if (progress > 0 || ["learning", "in_progress", "started"].includes(learningStatus)) {
        status = "in_progress";
      }

      return {
        id: course.id,
        title: course.title,
        description:
          course.description ||
          path?.objective ||
          path?.description ||
          "Khóa học thuộc lộ trình phát triển của phòng ban.",
        status,
        courseId: course.id,
        progress,
      };
    });
  }

  return [
    {
      id: "empty-path",
      title: path?.title || path?.name || "Chưa có lộ trình phù hợp",
      description:
        "Phòng ban của bạn chưa được gán khóa học trong lộ trình. Vui lòng kiểm tra cấu hình ở trang quản trị LMS.",
      status: "pending",
    },
  ];
};

const buildCompetency = (courses: any[], levels: any[]) => {
  if (levels.length > 0) {
    return levels.slice(0, 4).map((level: any) => ({
      name: level.position || `Level ${level.level_number}`,
      percent: normalizeProgress(level.avg_progress),
    }));
  }

  if (courses.length > 0) {
    return courses.slice(0, 4).map((course: any) => ({
      name: course.title,
      percent: normalizeProgress(course.progress_percent),
    }));
  }

  return [
    { name: "CRM & vận hành", percent: 0 },
    { name: "Tư vấn học viên", percent: 0 },
    { name: "Xử lý phụ huynh", percent: 0 },
    { name: "Quản lý lớp học", percent: 0 },
  ];
};

const buildRecommendedCourses = (courses: any[]) => {
  return courses.slice(0, 6).map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    level: row.level || "Cơ bản",
    duration: normalizeDurationMinutes(row.duration_minutes),
    durationMinutes: safeNumber(row.duration_minutes),
    lessonCount: safeNumber(row.lesson_count),
    progress: normalizeProgress(row.progress_percent),
    status: row.status,
    learningStatus: row.learning_status || "not_started",
  }));
};

const buildAchievements = (
  completedCourses: number,
  avgProgress: number,
  certificateCount: number
) => {
  return [
    {
      id: "monthly-growth",
      title: "Top tiến bộ tháng",
      description:
        avgProgress >= 70
          ? "Tăng trưởng năng lực nhanh nhất nhóm."
          : "Tiếp tục hoàn thành thêm khóa học để đạt danh hiệu này.",
      value: `${avgProgress}%`,
    },
    {
      id: "certificates",
      title: `${certificateCount || completedCourses} chứng chỉ`,
      description: "Đã hoàn thành các chứng chỉ bắt buộc.",
      value: certificateCount || completedCourses,
    },
    {
      id: "goal-on-time",
      title: "Mục tiêu đúng hạn",
      description:
        completedCourses > 0
          ? "Hoàn thành đúng deadline đào tạo."
          : "Chưa có dữ liệu hoàn thành mục tiêu.",
      value: completedCourses > 0 ? "Đạt" : "Đang học",
    },
    {
      id: "strong-skill",
      title: "Năng lực nổi bật",
      description:
        avgProgress >= 60
          ? "Năng lực học tập và vận hành đang phát triển tốt."
          : "Cần tiếp tục học để xác định năng lực nổi bật.",
      value: avgProgress >= 60 ? "Đang phát triển" : "Đang cập nhật",
    },
  ];
};

const buildPageData = async (userId: string | null) => {
  const { profile, path } = await getSelectedLearningPath(userId);

  const learningPathId = path?.id ? String(path.id) : null;

  const [courses, levels] = await Promise.all([
    getPathCourses(userId, learningPathId),
    getPathLevels(userId, learningPathId),
  ]);

  const totalCourses = courses.length;

  const completedCourses = courses.filter((course: any) => {
    const progress = normalizeProgress(course.progress_percent);
    const status = String(course.learning_status || "").toLowerCase();

    return (
      progress >= 100 ||
      ["completed", "done", "finished"].includes(status)
    );
  }).length;

  const avgProgress =
    totalCourses > 0
      ? Math.round(
          courses.reduce(
            (sum: number, course: any) =>
              sum + normalizeProgress(course.progress_percent),
            0
          ) / totalCourses
        )
      : 0;

  let currentLevelNumber = calcLevel(completedCourses);
  let nextLevelNumber = currentLevelNumber + 1;

  if (levels.length > 0) {
    const completedLevels = levels.filter((level: any) => {
      const total = safeNumber(level.total_courses);
      const completed = safeNumber(level.completed_courses);

      return total > 0 && completed >= total;
    });

    if (completedLevels.length > 0) {
      currentLevelNumber = Math.max(
        ...completedLevels.map((level: any) => safeNumber(level.level_number, 1))
      );
    } else {
      currentLevelNumber = safeNumber(levels[0]?.level_number, 1);
    }

    const nextLevel = levels.find(
      (level: any) => safeNumber(level.level_number) > currentLevelNumber
    );

    nextLevelNumber = nextLevel
      ? safeNumber(nextLevel.level_number, currentLevelNumber + 1)
      : currentLevelNumber + 1;
  }

  const certificateCount = await getCertificateCount(userId, completedCourses);

  return {
    summary: {
      currentLevel: `Level ${currentLevelNumber}`,
      nextLevel: `Level ${nextLevelNumber}`,
      relatedCourses: totalCourses,
      progressPercent: avgProgress,
    },
    path: path
      ? {
          id: path.id,
          title: path.title || path.name,
          name: path.name,
          code: path.code,
          department: path.department,
          targetRole: path.target_role,
          type: path.type,
          deadline: path.deadline,
          objective: path.objective,
          description: path.description,
          status: path.status,
        }
      : null,
    employee: profile
      ? {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          departmentId: profile.department_id,
          departmentName: profile.department_name,
          departmentCode: profile.department_code,
          position: profile.position,
        }
      : null,
    roadmap: buildRoadmap(path, courses, levels),
    competency: buildCompetency(courses, levels),
    recommendedCourses: buildRecommendedCourses(courses),
    achievements: buildAchievements(
      completedCourses,
      avgProgress,
      certificateCount
    ),
  };
};

export const getDevelopmentSummary = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data: data.summary,
    });
  } catch (error: any) {
    console.error("getDevelopmentSummary error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu tổng quan lộ trình phát triển",
      error: error.message,
    });
  }
};

export const getDevelopmentRoadmap = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data: data.roadmap,
    });
  } catch (error: any) {
    console.error("getDevelopmentRoadmap error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu lộ trình phát triển",
      error: error.message,
    });
  }
};

export const getCompetencyRadar = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data: data.competency,
    });
  } catch (error: any) {
    console.error("getCompetencyRadar error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu năng lực phát triển",
      error: error.message,
    });
  }
};

export const getRecommendedCourses = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data: data.recommendedCourses,
    });
  } catch (error: any) {
    console.error("getRecommendedCourses error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách khóa học đề xuất",
      error: error.message,
    });
  }
};

export const getDevelopmentAchievements = async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data: data.achievements,
    });
  } catch (error: any) {
    console.error("getDevelopmentAchievements error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu thành tích phát triển",
      error: error.message,
    });
  }
};

export const getEmployeeDevelopmentPathPage = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserIdFromRequest(req);
    const data = await buildPageData(userId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("getEmployeeDevelopmentPathPage error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu trang lộ trình phát triển",
      error: error.message,
    });
  }
};