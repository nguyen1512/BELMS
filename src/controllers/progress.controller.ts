import { Request, Response } from "express";
import { db } from "../config/db";

async function recalculateEnrollmentProgress(enrollmentId: string) {
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

  return progressPercent;
}

export async function getEnrollmentProgress(req: Request, res: Response) {
  try {
    const enrollmentId = String(req.params.enrollmentId || "");

    if (!enrollmentId) {
      return res.status(400).json({
        message: "Thiếu ID ghi danh",
      });
    }

    const enrollmentResult = await db.query(
      `
      SELECT
        e.id,
        e.user_id,
        e.course_id,
        e.progress_percent,
        e.status,
        e.enrolled_at,
        e.completed_at,
        c.title AS course_title,
        u.full_name AS user_name,
        u.email AS user_email
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN users u ON u.id = e.user_id
      WHERE e.id = $1
      LIMIT 1
      `,
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy ghi danh",
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
        lp.completed_at
      FROM enrollments e
      JOIN lessons l ON l.course_id = e.course_id
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = l.id
       AND lp.enrollment_id = e.id
      WHERE e.id = $1
      ORDER BY l.sort_order ASC, l.created_at ASC
      `,
      [enrollmentId]
    );

    return res.json({
      message: "Lấy tiến độ học tập thành công",
      enrollment: enrollmentResult.rows[0],
      lessons: lessonsResult.rows,
    });
  } catch (error) {
    console.error("Get progress error:", error);

    return res.status(500).json({
      message: "Lỗi server khi lấy tiến độ học tập",
    });
  }
}

export async function updateLessonProgress(req: Request, res: Response) {
  try {
    const enrollmentId = String(req.params.enrollmentId || "");
    const lessonId = String(req.params.lessonId || "");
    const { status } = req.body;

    if (!enrollmentId || !lessonId) {
      return res.status(400).json({
        message: "Thiếu ID ghi danh hoặc ID bài học",
      });
    }

    if (!["not_started", "learning", "completed"].includes(status)) {
      return res.status(400).json({
        message: "Trạng thái tiến độ không hợp lệ",
      });
    }

    const lessonCheck = await db.query(
      `
      SELECT l.id
      FROM enrollments e
      JOIN lessons l ON l.course_id = e.course_id
      WHERE e.id = $1
        AND l.id = $2
      LIMIT 1
      `,
      [enrollmentId, lessonId]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Bài học không thuộc khóa học đã ghi danh",
      });
    }

    const result = await db.query(
      `
      INSERT INTO lesson_progress (
        enrollment_id,
        lesson_id,
        status,
        completed_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
        now()
      )
      ON CONFLICT (enrollment_id, lesson_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = CASE
          WHEN EXCLUDED.status = 'completed' THEN now()
          ELSE NULL
        END,
        updated_at = now()
      RETURNING *
      `,
      [enrollmentId, lessonId, status]
    );

    const progressPercent = await recalculateEnrollmentProgress(enrollmentId);

    return res.json({
      message: "Cập nhật tiến độ bài học thành công",
      lessonProgress: result.rows[0],
      progressPercent,
    });
  } catch (error) {
    console.error("Update progress error:", error);

    return res.status(500).json({
      message: "Lỗi server khi cập nhật tiến độ bài học",
    });
  }
}