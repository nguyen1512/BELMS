import { Request, Response } from "express";
import { db } from "../config/db";

type AuthRequest = Request & {
  user?: {
    id?: string;
    email?: string;
  };
};

function getAuthUserId(req: Request) {
  return String((req as AuthRequest).user?.id || "");
}

export async function getMyLearning(req: Request, res: Response) {
  try {
    const userId = getAuthUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Bạn chưa đăng nhập",
      });
    }

    const result = await db.query(
      `
      SELECT
        e.id AS enrollment_id,
        e.progress_percent,
        e.status AS enrollment_status,
        e.enrolled_at,
        e.completed_at,

        c.id AS course_id,
        c.title,
        c.description,
        c.level,
        c.duration_minutes,
        c.status AS course_status
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.user_id = $1
      ORDER BY e.enrolled_at DESC
      `,
      [userId]
    );

    return res.json({
      message: "Lấy danh sách khóa học của tôi thành công",
      courses: result.rows,
    });
  } catch (error) {
    console.error("Get my learning error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy khóa học của tôi",
    });
  }
}

export async function getMyLearningDetail(req: Request, res: Response) {
  try {
    const userId = getAuthUserId(req);
    const enrollmentId = String(req.params.enrollmentId || "");

    if (!userId) {
      return res.status(401).json({
        message: "Bạn chưa đăng nhập",
      });
    }

    const enrollmentResult = await db.query(
      `
      SELECT
        e.id AS enrollment_id,
        e.progress_percent,
        e.status AS enrollment_status,
        e.enrolled_at,
        e.completed_at,

        c.id AS course_id,
        c.title,
        c.description,
        c.level,
        c.duration_minutes
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.id = $1
        AND e.user_id = $2
      LIMIT 1
      `,
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy khóa học của bạn",
      });
    }

    const lessonsResult = await db.query(
    `
    SELECT
        l.id,
        l.title,
        l.description,
        l.content_type,
        l.content_url,
        l.duration_minutes,
        l.sort_order,
        l.status AS lesson_status,
        COALESCE(lp.status, 'not_started') AS progress_status,
        lp.completed_at,
        q.id AS quiz_id,
        q.title AS quiz_title
    FROM enrollments e
    JOIN lessons l ON l.course_id = e.course_id
    LEFT JOIN lesson_progress lp
        ON lp.lesson_id = l.id
    AND lp.enrollment_id = e.id
    LEFT JOIN quizzes q
        ON q.lesson_id = l.id
    AND q.status = 'published'
    WHERE e.id = $1
        AND e.user_id = $2
    ORDER BY l.sort_order ASC, l.created_at ASC
    `,
    [enrollmentId, userId]
    );

    return res.json({
      message: "Lấy chi tiết khóa học của tôi thành công",
      enrollment: enrollmentResult.rows[0],
      lessons: lessonsResult.rows,
    });
  } catch (error) {
    console.error("Get my learning detail error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy chi tiết khóa học",
    });
  }
}

export async function completeMyLesson(req: Request, res: Response) {
  try {
    const userId = getAuthUserId(req);
    const enrollmentId = String(req.params.enrollmentId || "");
    const lessonId = String(req.params.lessonId || "");

    if (!userId) {
      return res.status(401).json({
        message: "Bạn chưa đăng nhập",
      });
    }

    const checkResult = await db.query(
      `
      SELECT
        e.id AS enrollment_id,
        l.id AS lesson_id
      FROM enrollments e
      JOIN lessons l ON l.course_id = e.course_id
      WHERE e.id = $1
        AND e.user_id = $2
        AND l.id = $3
      LIMIT 1
      `,
      [enrollmentId, userId, lessonId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: "Bài học không thuộc khóa học của bạn",
      });
    }

    await db.query(
      `
      INSERT INTO lesson_progress (
        enrollment_id,
        lesson_id,
        status,
        completed_at,
        updated_at
      )
      VALUES ($1, $2, 'completed', now(), now())
      ON CONFLICT (enrollment_id, lesson_id)
      DO UPDATE SET
        status = 'completed',
        completed_at = now(),
        updated_at = now()
      `,
      [enrollmentId, lessonId]
    );

    const totalLessonsResult = await db.query(
      `
      SELECT COUNT(l.id)::int AS total
      FROM enrollments e
      JOIN lessons l ON l.course_id = e.course_id
      WHERE e.id = $1
      `,
      [enrollmentId]
    );

    const completedLessonsResult = await db.query(
      `
      SELECT COUNT(lp.id)::int AS completed
      FROM lesson_progress lp
      WHERE lp.enrollment_id = $1
        AND lp.status = 'completed'
      `,
      [enrollmentId]
    );

    const total = totalLessonsResult.rows[0].total || 0;
    const completed = completedLessonsResult.rows[0].completed || 0;

    const progressPercent =
      total === 0 ? 0 : Math.round((completed / total) * 100);

    await db.query(
      `
      UPDATE enrollments
      SET
        progress_percent = $1,
        status = CASE
          WHEN $1 >= 100 THEN 'completed'
          ELSE 'learning'
        END,
        completed_at = CASE
          WHEN $1 >= 100 THEN now()
          ELSE NULL
        END
      WHERE id = $2
      `,
      [progressPercent, enrollmentId]
    );

    return res.json({
      message: "Hoàn thành bài học thành công",
      progressPercent,
    });
  } catch (error) {
    console.error("Complete my lesson error:", error);

    return res.status(500).json({
      message: "Lỗi server khi hoàn thành bài học",
    });
  }
}