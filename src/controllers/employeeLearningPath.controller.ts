import { Request, Response } from "express";
import {db} from "../config/db";

function getUserId(req: Request): string | null {
  const userId =
    (req.query.userId as string) ||
    (req.query.user_id as string) ||
    (req.headers["x-user-id"] as string);

  return userId || null;
}

function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const getEmployeeLearningPathSummary = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const summarySql = `
      WITH user_courses AS (
        SELECT
          c.id AS course_id,
          c.title,
          c.description,
          c.thumbnail_url,
          c.status,
          COALESCE(e.progress, 0) AS progress,
          e.status AS enrollment_status
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = $1
          AND COALESCE(c.deleted_at, NULL) IS NULL
      ),
      lesson_stats AS (
        SELECT
          uc.course_id,
          COUNT(l.id) AS total_lessons
        FROM user_courses uc
        LEFT JOIN lessons l ON l.course_id = uc.course_id
        GROUP BY uc.course_id
      )
      SELECT
        COUNT(uc.course_id) AS total_courses,
        COUNT(*) FILTER (
          WHERE COALESCE(uc.progress, 0) >= 100
             OR uc.enrollment_status IN ('completed', 'done', 'finished')
        ) AS completed_courses,
        ROUND(COALESCE(AVG(uc.progress), 0)) AS average_progress,
        COALESCE(SUM(ls.total_lessons), 0) AS total_lessons
      FROM user_courses uc
      LEFT JOIN lesson_stats ls ON ls.course_id = uc.course_id;
    `;

    const result = await db.query(summarySql, [userId]);
    const row = result.rows[0] || {};

    const totalCourses = toNumber(row.total_courses);
    const completedCourses = toNumber(row.completed_courses);
    const averageProgress = toNumber(row.average_progress);
    const totalLessons = toNumber(row.total_lessons);

    return res.json({
      success: true,
      data: {
        totalCourses,
        completedCourses,
        currentProgress: averageProgress,
        targetCertificates: completedCourses > 0 ? 1 : 0,
        totalLessons,
      },
    });
  } catch (error: any) {
    console.error("getEmployeeLearningPathSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê lộ trình học tập",
      error: error.message,
    });
  }
};

export const getEmployeeLearningPathCourses = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const coursesSql = `
      WITH lesson_count AS (
        SELECT
          course_id,
          COUNT(*) AS total_lessons
        FROM lessons
        GROUP BY course_id
      ),
      completed_lesson_count AS (
        SELECT
          lp.course_id,
          COUNT(*) AS completed_lessons
        FROM lesson_progress lp
        WHERE lp.user_id = $1
          AND (
            lp.status IN ('completed', 'done', 'finished')
            OR lp.completed_at IS NOT NULL
          )
        GROUP BY lp.course_id
      )
      SELECT
        c.id,
        c.title,
        c.description,
        c.thumbnail_url,
        c.level,
        c.duration,
        c.status AS course_status,
        e.status AS enrollment_status,
        e.created_at AS enrolled_at,
        COALESCE(e.progress, 0) AS progress,
        COALESCE(lc.total_lessons, 0) AS total_lessons,
        COALESCE(clc.completed_lessons, 0) AS completed_lessons
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN lesson_count lc ON lc.course_id = c.id
      LEFT JOIN completed_lesson_count clc ON clc.course_id = c.id
      WHERE e.user_id = $1
        AND COALESCE(c.deleted_at, NULL) IS NULL
      ORDER BY
        CASE
          WHEN COALESCE(e.progress, 0) >= 100 THEN 1
          ELSE 0
        END ASC,
        e.created_at ASC;
    `;

    const result = await db.query(coursesSql, [userId]);

    const courses = result.rows.map((row, index) => {
      const progress = toNumber(row.progress);
      const totalLessons = toNumber(row.total_lessons);
      const completedLessons = toNumber(row.completed_lessons);

      let status = "not_started";
      let statusLabel = "Chưa học";

      if (progress >= 100 || row.enrollment_status === "completed") {
        status = "completed";
        statusLabel = "Hoàn thành";
      } else if (progress > 0 || completedLessons > 0) {
        status = "learning";
        statusLabel = "Đang học";
      }

      return {
        order: index + 1,
        id: row.id,
        title: row.title,
        description: row.description,
        thumbnailUrl: row.thumbnail_url,
        level: row.level,
        duration: row.duration,
        progress,
        status,
        statusLabel,
        totalLessons,
        completedLessons,
        enrolledAt: row.enrolled_at,
      };
    });

    return res.json({
      success: true,
      data: courses,
    });
  } catch (error: any) {
    console.error("getEmployeeLearningPathCourses error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách khóa học trong lộ trình",
      error: error.message,
    });
  }
};

export const getEmployeeLearningPath = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const summarySql = `
      WITH user_courses AS (
        SELECT
          c.id AS course_id,
          COALESCE(e.progress, 0) AS progress,
          e.status AS enrollment_status
        FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = $1
          AND COALESCE(c.deleted_at, NULL) IS NULL
      ),
      lesson_stats AS (
        SELECT
          uc.course_id,
          COUNT(l.id) AS total_lessons
        FROM user_courses uc
        LEFT JOIN lessons l ON l.course_id = uc.course_id
        GROUP BY uc.course_id
      )
      SELECT
        COUNT(uc.course_id) AS total_courses,
        COUNT(*) FILTER (
          WHERE COALESCE(uc.progress, 0) >= 100
             OR uc.enrollment_status IN ('completed', 'done', 'finished')
        ) AS completed_courses,
        ROUND(COALESCE(AVG(uc.progress), 0)) AS average_progress,
        COALESCE(SUM(ls.total_lessons), 0) AS total_lessons
      FROM user_courses uc
      LEFT JOIN lesson_stats ls ON ls.course_id = uc.course_id;
    `;

    const coursesSql = `
      WITH lesson_count AS (
        SELECT
          course_id,
          COUNT(*) AS total_lessons
        FROM lessons
        GROUP BY course_id
      ),
      completed_lesson_count AS (
        SELECT
          lp.course_id,
          COUNT(*) AS completed_lessons
        FROM lesson_progress lp
        WHERE lp.user_id = $1
          AND (
            lp.status IN ('completed', 'done', 'finished')
            OR lp.completed_at IS NOT NULL
          )
        GROUP BY lp.course_id
      )
      SELECT
        c.id,
        c.title,
        c.description,
        c.thumbnail_url,
        c.level,
        c.duration,
        c.status AS course_status,
        e.status AS enrollment_status,
        e.created_at AS enrolled_at,
        COALESCE(e.progress, 0) AS progress,
        COALESCE(lc.total_lessons, 0) AS total_lessons,
        COALESCE(clc.completed_lessons, 0) AS completed_lessons
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN lesson_count lc ON lc.course_id = c.id
      LEFT JOIN completed_lesson_count clc ON clc.course_id = c.id
      WHERE e.user_id = $1
        AND COALESCE(c.deleted_at, NULL) IS NULL
      ORDER BY
        CASE
          WHEN COALESCE(e.progress, 0) >= 100 THEN 1
          ELSE 0
        END ASC,
        e.created_at ASC;
    `;

    const [summaryResult, coursesResult] = await Promise.all([
      db.query(summarySql, [userId]),
      db.query(coursesSql, [userId]),
    ]);

    const summaryRow = summaryResult.rows[0] || {};

    const totalCourses = toNumber(summaryRow.total_courses);
    const completedCourses = toNumber(summaryRow.completed_courses);
    const currentProgress = toNumber(summaryRow.average_progress);
    const totalLessons = toNumber(summaryRow.total_lessons);

    const courses = coursesResult.rows.map((row, index) => {
      const progress = toNumber(row.progress);
      const totalLessons = toNumber(row.total_lessons);
      const completedLessons = toNumber(row.completed_lessons);

      let status = "not_started";
      let statusLabel = "Chưa học";

      if (progress >= 100 || row.enrollment_status === "completed") {
        status = "completed";
        statusLabel = "Hoàn thành";
      } else if (progress > 0 || completedLessons > 0) {
        status = "learning";
        statusLabel = "Đang học";
      }

      return {
        order: index + 1,
        id: row.id,
        title: row.title,
        description: row.description,
        thumbnailUrl: row.thumbnail_url,
        level: row.level,
        duration: row.duration,
        progress,
        status,
        statusLabel,
        totalLessons,
        completedLessons,
        enrolledAt: row.enrolled_at,
      };
    });

    return res.json({
      success: true,
      data: {
        pageTitle: "Lộ trình học tập cá nhân",
        pageSubtitle:
          "Theo dõi các khóa học theo thứ tự, điều kiện mở khóa, tiến độ hoàn thành và mục tiêu chứng chỉ của bạn.",
        summary: {
          totalCourses,
          completedCourses,
          currentProgress,
          targetCertificates: completedCourses > 0 ? 1 : 0,
          totalLessons,
        },
        goal: {
          title: "Chứng chỉ vận hành LMS & CRM",
          description:
            "Hoàn thành đầy đủ các khóa học theo thứ tự để mở khóa bài kiểm tra cuối lộ trình và nhận chứng chỉ nội bộ.",
          progress: currentProgress,
        },
        steps: courses,
      },
    });
  } catch (error: any) {
    console.error("getEmployeeLearningPath error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy dữ liệu lộ trình học tập",
      error: error.message,
    });
  }
};