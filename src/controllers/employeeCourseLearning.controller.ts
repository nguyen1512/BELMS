import { Request, Response } from "express";
import {db} from "../config/db";

function getUserId(req: Request): string | null {
  const userId =
    (req.query.userId as string) ||
    (req.query.user_id as string) ||
    (req.body?.userId as string) ||
    (req.body?.user_id as string) ||
    (req.headers["x-user-id"] as string);

  return userId || null;
}

function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function recalculateCourseProgress(userId: string, courseId: string) {
  const totalLessonsResult = await db.query(
    `
    SELECT COUNT(*)::int AS total_lessons
    FROM lessons
    WHERE course_id = $1
  `,
    [courseId]
  );

  const completedLessonsResult = await db.query(
    `
    SELECT COUNT(DISTINCT lesson_id)::int AS completed_lessons
    FROM lesson_progress
    WHERE user_id = $1
      AND course_id = $2
      AND (
        LOWER(COALESCE(status, '')) IN ('completed', 'done', 'finished', 'hoan_thanh', 'hoàn thành')
        OR completed_at IS NOT NULL
      )
  `,
    [userId, courseId]
  );

  const totalLessons = toNumber(totalLessonsResult.rows[0]?.total_lessons);
  const completedLessons = toNumber(
    completedLessonsResult.rows[0]?.completed_lessons
  );

  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const status = progressPercent >= 100 ? "completed" : "learning";

  await db.query(
    `
    UPDATE enrollments
    SET 
      progress_percent = $1,
      status = $2,
      completed_at = CASE WHEN $1 >= 100 THEN NOW() ELSE completed_at END
    WHERE user_id = $3
      AND course_id = $4
  `,
    [progressPercent, status, userId, courseId]
  );

  return {
    totalLessons,
    completedLessons,
    progressPercent,
    status,
  };
}

export const getMyCourses = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const result = await db.query(
      `
      WITH lesson_count AS (
        SELECT
          course_id,
          COUNT(*)::int AS total_lessons
        FROM lessons
        GROUP BY course_id
      ),
      completed_lesson_count AS (
        SELECT
          course_id,
          COUNT(DISTINCT lesson_id)::int AS completed_lessons
        FROM lesson_progress
        WHERE user_id = $1
          AND (
            LOWER(COALESCE(status, '')) IN ('completed', 'done', 'finished', 'hoan_thanh', 'hoàn thành')
            OR completed_at IS NOT NULL
          )
        GROUP BY course_id
      )
      SELECT
        c.id,
        c.title,
        c.code,
        c.description,
        c.thumbnail_url,
        c.level,
        c.duration_minutes,
        c.course_type,
        c.status AS course_status,

        e.id AS enrollment_id,
        e.progress_percent,
        e.status AS enrollment_status,
        e.enrolled_at,
        e.completed_at,

        COALESCE(lc.total_lessons, 0) AS total_lessons,
        COALESCE(clc.completed_lessons, 0) AS completed_lessons
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN lesson_count lc ON lc.course_id = c.id
      LEFT JOIN completed_lesson_count clc ON clc.course_id = c.id
      WHERE e.user_id = $1
      ORDER BY e.enrolled_at DESC
    `,
      [userId]
    );

    const courses = result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      level: row.level,
      durationMinutes: toNumber(row.duration_minutes),
      courseType: row.course_type,
      courseStatus: row.course_status,

      enrollmentId: row.enrollment_id,
      progress: toNumber(row.progress_percent),
      enrollmentStatus: row.enrollment_status,
      enrolledAt: row.enrolled_at,
      completedAt: row.completed_at,

      totalLessons: toNumber(row.total_lessons),
      completedLessons: toNumber(row.completed_lessons),
    }));

    return res.json({
      success: true,
      data: courses,
    });
  } catch (error: any) {
    console.error("getMyCourses error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy khóa học của học viên",
      error: error.message,
    });
  }
};

export const getEmployeeCourseContent = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserId(req);
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu courseId",
      });
    }

    const courseResult = await db.query(
      `
      SELECT
        c.id,
        c.title,
        c.code,
        c.description,
        c.thumbnail_url,
        c.level,
        c.duration_minutes,
        c.course_type,
        c.status AS course_status,
        e.id AS enrollment_id,
        e.progress_percent,
        e.status AS enrollment_status,
        e.enrolled_at,
        e.completed_at
      FROM courses c
      LEFT JOIN enrollments e
        ON e.course_id = c.id
       AND ($2::uuid IS NULL OR e.user_id = $2::uuid)
      WHERE c.id = $1
      LIMIT 1
    `,
      [courseId, userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khóa học",
      });
    }

    const lessonsResult = await db.query(
      `
      SELECT
        l.id,
        l.course_id,
        l.title,
        l.description,
        l.content_type,
        l.content_url,
        l.duration_minutes,
        l.sort_order,
        l.status AS lesson_status,
        l.resource_id,
        l.quiz_id,
        l.assignment_url,
        l.library_resource_id,
        l.quiz_question_count,
        l.is_required,

        lp.id AS lesson_progress_id,
        lp.status AS progress_status,
        lp.watched_minutes,
        lp.completed_at
      FROM lessons l
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = l.id
       AND ($2::uuid IS NULL OR lp.user_id = $2::uuid)
      WHERE l.course_id = $1
      ORDER BY COALESCE(l.sort_order, 9999), l.created_at ASC
    `,
      [courseId, userId]
    );

    const courseRow = courseResult.rows[0];

    const lessons = lessonsResult.rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      contentType: row.content_type,
      contentUrl: row.content_url,
      durationMinutes: toNumber(row.duration_minutes),
      sortOrder: toNumber(row.sort_order),
      lessonStatus: row.lesson_status,
      resourceId: row.resource_id,
      quizId: row.quiz_id,
      assignmentUrl: row.assignment_url,
      libraryResourceId: row.library_resource_id,
      quizQuestionCount: toNumber(row.quiz_question_count),
      isRequired: row.is_required ?? true,

      progressId: row.lesson_progress_id,
      progressStatus: row.progress_status || "not_started",
      watchedMinutes: toNumber(row.watched_minutes),
      completedAt: row.completed_at,
      isCompleted: Boolean(row.completed_at),
    }));

    return res.json({
      success: true,
      data: {
        course: {
          id: courseRow.id,
          code: courseRow.code,
          title: courseRow.title,
          description: courseRow.description,
          thumbnailUrl: courseRow.thumbnail_url,
          level: courseRow.level,
          durationMinutes: toNumber(courseRow.duration_minutes),
          courseType: courseRow.course_type,
          courseStatus: courseRow.course_status,

          enrollmentId: courseRow.enrollment_id,
          progress: toNumber(courseRow.progress_percent),
          enrollmentStatus: courseRow.enrollment_status,
          enrolledAt: courseRow.enrolled_at,
          completedAt: courseRow.completed_at,
        },
        lessons,
      },
    });
  } catch (error: any) {
    console.error("getEmployeeCourseContent error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy nội dung khóa học",
      error: error.message,
    });
  }
};

export const getEmployeeLessonDetail = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = getUserId(req);
    const { lessonId } = req.params;

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu lessonId",
      });
    }

    const result = await db.query(
      `
      SELECT
        l.id,
        l.course_id,
        l.title,
        l.description,
        l.content_type,
        l.content_url,
        l.duration_minutes,
        l.sort_order,
        l.status AS lesson_status,
        l.resource_id,
        l.quiz_id,
        l.assignment_url,
        l.library_resource_id,
        l.quiz_question_count,
        l.is_required,

        c.title AS course_title,
        c.code AS course_code,

        lp.id AS lesson_progress_id,
        lp.status AS progress_status,
        lp.watched_minutes,
        lp.completed_at
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      LEFT JOIN lesson_progress lp
        ON lp.lesson_id = l.id
       AND ($2::uuid IS NULL OR lp.user_id = $2::uuid)
      WHERE l.id = $1
      LIMIT 1
    `,
      [lessonId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học",
      });
    }

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: row.id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        courseCode: row.course_code,

        title: row.title,
        description: row.description,
        contentType: row.content_type,
        contentUrl: row.content_url,
        durationMinutes: toNumber(row.duration_minutes),
        sortOrder: toNumber(row.sort_order),
        lessonStatus: row.lesson_status,

        resourceId: row.resource_id,
        quizId: row.quiz_id,
        assignmentUrl: row.assignment_url,
        libraryResourceId: row.library_resource_id,
        quizQuestionCount: toNumber(row.quiz_question_count),
        isRequired: row.is_required ?? true,

        progressId: row.lesson_progress_id,
        progressStatus: row.progress_status || "not_started",
        watchedMinutes: toNumber(row.watched_minutes),
        completedAt: row.completed_at,
        isCompleted: Boolean(row.completed_at),
      },
    });
  } catch (error: any) {
    console.error("getEmployeeLessonDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết bài học",
      error: error.message,
    });
  }
};

export const completeLesson = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const userId = getUserId(req);
    const { lessonId } = req.params;
    const watchedMinutes = toNumber(req.body?.watchedMinutes);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu lessonId",
      });
    }

    await client.query("BEGIN");

    const lessonResult = await client.query(
      `
      SELECT id, course_id
      FROM lessons
      WHERE id = $1
      LIMIT 1
    `,
      [lessonId]
    );

    if (lessonResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài học",
      });
    }

    const courseId = lessonResult.rows[0].course_id;

    const enrollmentResult = await client.query(
      `
      SELECT id
      FROM enrollments
      WHERE user_id = $1
        AND course_id = $2
      LIMIT 1
    `,
      [userId, courseId]
    );

    if (enrollmentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Học viên chưa được ghi danh vào khóa học này",
      });
    }

    const enrollmentId = enrollmentResult.rows[0].id;

    const progressResult = await client.query(
      `
      SELECT id
      FROM lesson_progress
      WHERE user_id = $1
        AND lesson_id = $2
      LIMIT 1
    `,
      [userId, lessonId]
    );

    if (progressResult.rows.length > 0) {
      await client.query(
        `
        UPDATE lesson_progress
        SET
          status = 'completed',
          watched_minutes = GREATEST(COALESCE(watched_minutes, 0), $1),
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW(),
          enrollment_id = $2,
          course_id = $3
        WHERE id = $4
      `,
        [watchedMinutes, enrollmentId, courseId, progressResult.rows[0].id]
      );
    } else {
      await client.query(
        `
        INSERT INTO lesson_progress (
          user_id,
          course_id,
          lesson_id,
          enrollment_id,
          status,
          watched_minutes,
          completed_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'completed', $5, NOW(), NOW(), NOW())
      `,
        [userId, courseId, lessonId, enrollmentId, watchedMinutes]
      );
    }

    await client.query("COMMIT");

    const courseProgress = await recalculateCourseProgress(userId, courseId);

    return res.json({
      success: true,
      message: "Đã hoàn thành bài học",
      data: {
        lessonId,
        courseId,
        ...courseProgress,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("completeLesson error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi hoàn thành bài học",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

export const submitLessonQuiz = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { quizId } = req.params;

    const lessonId = req.body?.lessonId;
    const score = toNumber(req.body?.score);
    const totalQuestions = toNumber(req.body?.totalQuestions);
    const correctAnswers = toNumber(req.body?.correctAnswers);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu quizId",
      });
    }

    let courseProgress = null;

    if (lessonId) {
      const lessonResult = await db.query(
        `
        SELECT 
          id,
          course_id
        FROM lessons
        WHERE id = $1
          AND quiz_id = $2
        LIMIT 1
        `,
        [lessonId, quizId]
      );

      if (lessonResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài học tương ứng với quiz này",
        });
      }

      const courseId = lessonResult.rows[0].course_id;

      const enrollmentResult = await db.query(
        `
        SELECT id
        FROM enrollments
        WHERE user_id = $1
          AND course_id = $2
        LIMIT 1
        `,
        [userId, courseId]
      );

      if (enrollmentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Học viên chưa được ghi danh vào khóa học này",
        });
      }

      const enrollmentId = enrollmentResult.rows[0].id;

      const existedProgress = await db.query(
        `
        SELECT id
        FROM lesson_progress
        WHERE user_id = $1
          AND lesson_id = $2
        LIMIT 1
        `,
        [userId, lessonId]
      );

      if (existedProgress.rows.length > 0) {
        await db.query(
          `
          UPDATE lesson_progress
          SET
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW(),
            enrollment_id = $1,
            course_id = $2
          WHERE id = $3
          `,
          [enrollmentId, courseId, existedProgress.rows[0].id]
        );
      } else {
        await db.query(
          `
          INSERT INTO lesson_progress (
            user_id,
            course_id,
            lesson_id,
            enrollment_id,
            status,
            watched_minutes,
            completed_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'completed', 0, NOW(), NOW(), NOW())
          `,
          [userId, courseId, lessonId, enrollmentId]
        );
      }

      courseProgress = await recalculateCourseProgress(userId, courseId);
    }

    return res.json({
      success: true,
      message: "Đã nộp bài quiz",
      data: {
        quizId,
        lessonId: lessonId || null,
        score,
        totalQuestions,
        correctAnswers,
        passed: score >= 50,
        courseProgress,
      },
    });
  } catch (error: any) {
    console.error("submitLessonQuiz error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi nộp quiz",
      error: error.message,
    });
  }
};

export const completeCourse = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { courseId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu courseId",
      });
    }

    const enrollmentResult = await db.query(
      `
      SELECT id
      FROM enrollments
      WHERE user_id = $1
        AND course_id = $2
      LIMIT 1
    `,
      [userId, courseId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Học viên chưa được ghi danh vào khóa học này",
      });
    }

    await db.query(
      `
      UPDATE enrollments
      SET
        progress_percent = 100,
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW())
      WHERE user_id = $1
        AND course_id = $2
    `,
      [userId, courseId]
    );

    return res.json({
      success: true,
      message: "Đã hoàn thành khóa học",
      data: {
        courseId,
        progressPercent: 100,
        status: "completed",
      },
    });
  } catch (error: any) {
    console.error("completeCourse error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi hoàn thành khóa học",
      error: error.message,
    });
  }
};