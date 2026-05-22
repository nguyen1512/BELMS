import { Request, Response } from "express";
import { db } from "../config/db";

function getMonthRange(month?: string) {
  const safeMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

  return {
    month: safeMonth,
    startDate: `${safeMonth}-01`,
  };
}

function getCurrentUserId(req: Request) {
  const fromQuery = req.query.userId as string | undefined;
  const fromBody = req.body?.user_id as string | undefined;

  return fromQuery || fromBody || null;
}

export async function getStudyPlanCalendar(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const userId = getCurrentUserId(req);
    const { month, startDate } = getMonthRange(req.query.month as string);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const enrolledCoursesResult = await client.query(
      `
      SELECT 
        e.course_id,
        e.progress_percent,
        e.status AS enrollment_status,
        c.title AS course_title,
        c.duration_minutes
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      WHERE e.user_id = $1
        AND COALESCE(e.status, 'learning') IN ('learning', 'active', 'enrolled')
      ORDER BY e.enrolled_at ASC
      `,
      [userId]
    );

    const courseIds = enrolledCoursesResult.rows.map((item) => item.course_id);

    const manualEventsResult = await client.query(
      `
      SELECT
        spe.id,
        spe.user_id,
        spe.course_id,
        c.title AS course_title,
        spe.title,
        spe.description,
        spe.event_type,
        spe.start_time,
        spe.end_time,
        spe.status,
        spe.priority,
        spe.source_type,
        spe.source_id,
        'manual' AS origin
      FROM study_plan_events spe
      LEFT JOIN courses c ON c.id = spe.course_id
      WHERE spe.user_id = $1
        AND spe.start_time >= $2::date
        AND spe.start_time < ($2::date + INTERVAL '1 month')
      ORDER BY spe.start_time ASC
      `,
      [userId, startDate]
    );

    let liveClasses: any[] = [];
    let lessons: any[] = [];
    let quizzes: any[] = [];
    let assessments: any[] = [];

    if (courseIds.length > 0) {
      const liveClassesResult = await client.query(
        `
        SELECT
          lc.id,
          $1::uuid AS user_id,
          lc.course_id,
          c.title AS course_title,
          lc.title,
          lc.description,
          'live_class' AS event_type,
          (lc.class_date::date + lc.start_time) AS start_time,
          (lc.class_date::date + lc.end_time) AS end_time,
          COALESCE(lc.status, 'scheduled') AS status,
          'high' AS priority,
          'live_class' AS source_type,
          lc.id AS source_id,
          COALESCE(lc.meeting_link, lc.meeting_url) AS meeting_url,
          lc.room_name,
          lc.location,
          'system' AS origin
        FROM live_classes lc
        JOIN courses c ON c.id = lc.course_id
        WHERE lc.course_id = ANY($2::uuid[])
          AND lc.class_date >= $3::date
          AND lc.class_date < ($3::date + INTERVAL '1 month')
          AND COALESCE(lc.status, 'scheduled') NOT IN ('deleted', 'cancelled')
        ORDER BY lc.class_date ASC, lc.start_time ASC
        `,
        [userId, courseIds, startDate]
      );

      liveClasses = liveClassesResult.rows;

      const lessonsResult = await client.query(
        `
        SELECT
          l.id,
          $1::uuid AS user_id,
          l.course_id,
          c.title AS course_title,
          l.title,
          l.description,
          CASE 
            WHEN COALESCE(l.content_type, '') ILIKE '%video%' THEN 'video'
            ELSE 'lesson'
          END AS event_type,
          NULL::timestamp AS start_time,
          NULL::timestamp AS end_time,
          COALESCE(l.status, 'active') AS status,
          CASE 
            WHEN COALESCE(l.is_required, false) = true THEN 'high'
            ELSE 'normal'
          END AS priority,
          'lesson' AS source_type,
          l.id AS source_id,
          l.duration_minutes,
          l.content_type,
          l.sort_order,
          'system_todo' AS origin
        FROM lessons l
        JOIN courses c ON c.id = l.course_id
        WHERE l.course_id = ANY($2::uuid[])
          AND COALESCE(l.status, 'active') NOT IN ('deleted', 'inactive')
        ORDER BY c.title ASC, COALESCE(l.sort_order, 9999) ASC, l.created_at ASC
        `,
        [userId, courseIds]
      );

      lessons = lessonsResult.rows;

      const quizzesResult = await client.query(
        `
        SELECT
          q.id,
          $1::uuid AS user_id,
          q.course_id,
          c.title AS course_title,
          q.title,
          q.description,
          'quiz' AS event_type,
          NULL::timestamp AS start_time,
          NULL::timestamp AS end_time,
          COALESCE(q.status, 'active') AS status,
          'normal' AS priority,
          'quiz' AS source_type,
          q.id AS source_id,
          q.pass_score,
          q.lesson_id,
          'system_todo' AS origin
        FROM quizzes q
        JOIN courses c ON c.id = q.course_id
        WHERE q.course_id = ANY($2::uuid[])
          AND COALESCE(q.status, 'active') NOT IN ('deleted', 'inactive')
        ORDER BY q.created_at ASC
        `,
        [userId, courseIds]
      );

      quizzes = quizzesResult.rows;

      const assessmentsResult = await client.query(
        `
        SELECT
          a.id,
          $1::uuid AS user_id,
          a.course_id,
          c.title AS course_title,
          a.title,
          a.description,
          COALESCE(a.assessment_type, 'assessment') AS event_type,
          NULL::timestamp AS start_time,
          NULL::timestamp AS end_time,
          COALESCE(a.status, 'active') AS status,
          'high' AS priority,
          'assessment' AS source_type,
          a.id AS source_id,
          a.pass_score,
          a.time_limit_minutes,
          a.max_attempts,
          a.lesson_id,
          a.question_count,
          'system_todo' AS origin
        FROM assessments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.course_id = ANY($2::uuid[])
          AND COALESCE(a.status, 'active') NOT IN ('deleted', 'inactive')
        ORDER BY a.created_at ASC
        `,
        [userId, courseIds]
      );

      assessments = assessmentsResult.rows;
    }

    const calendarEvents = [...manualEventsResult.rows, ...liveClasses];

    const todoItems = [
      ...lessons.slice(0, 8),
      ...quizzes.slice(0, 8),
      ...assessments.slice(0, 8),
      ...manualEventsResult.rows
        .filter((item) => item.status !== "completed")
        .slice(0, 8),
    ].slice(0, 12);

    const totalStudyMinutes =
      lessons.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0) +
      assessments.reduce((sum, item) => sum + Number(item.time_limit_minutes || 0), 0) +
      liveClasses.reduce((sum, item) => {
        if (!item.start_time || !item.end_time) return sum;

        const start = new Date(item.start_time).getTime();
        const end = new Date(item.end_time).getTime();

        if (Number.isNaN(start) || Number.isNaN(end)) return sum;

        return sum + Math.max(0, Math.round((end - start) / 60000));
      }, 0);

    const completedManual = manualEventsResult.rows.filter(
      (item) => item.status === "completed"
    ).length;

    const totalTaskCount =
      lessons.length +
      quizzes.length +
      assessments.length +
      manualEventsResult.rows.length;

    const progressPercent =
      totalTaskCount > 0
        ? Math.round((completedManual / totalTaskCount) * 100)
        : 0;

    return res.json({
      success: true,
      data: {
        month,
        enrolled_courses: enrolledCoursesResult.rows,
        events: calendarEvents,
        todos: todoItems,
        summary: {
          total_events_in_month: calendarEvents.length,
          total_lessons: lessons.length,
          total_quizzes: quizzes.length,
          total_assessments: assessments.length,
          total_live_classes: liveClasses.length,
          estimated_hours: Math.round((totalStudyMinutes / 60) * 10) / 10,
          progress_percent: progressPercent,
        },
      },
    });
  } catch (error: any) {
    console.error("getStudyPlanCalendar error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tải kế hoạch học tập",
      error: error?.message || String(error),
      code: error?.code,
    });
  } finally {
    client.release();
  }
}

export async function createStudyPlanEvent(req: Request, res: Response) {
  try {
    const {
      user_id,
      course_id,
      title,
      description,
      event_type,
      start_time,
      end_time,
      priority,
    } = req.body;

    if (!user_id || !title || !start_time) {
      return res.status(400).json({
        success: false,
        message: "Thiếu user_id, title hoặc start_time",
      });
    }

    const result = await db.query(
      `
      INSERT INTO study_plan_events (
        user_id,
        course_id,
        title,
        description,
        event_type,
        start_time,
        end_time,
        status,
        priority,
        source_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, 'manual')
      RETURNING *
      `,
      [
        user_id,
        course_id || null,
        title,
        description || null,
        event_type || "custom",
        start_time,
        end_time || null,
        priority || "normal",
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Tạo kế hoạch học tập thành công",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("createStudyPlanEvent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể tạo kế hoạch học tập",
      error: error?.message || String(error),
      code: error?.code,
    });
  }
}

export async function updateStudyPlanEvent(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const {
      course_id,
      title,
      description,
      event_type,
      start_time,
      end_time,
      status,
      priority,
    } = req.body;

    const result = await db.query(
      `
      UPDATE study_plan_events
      SET
        course_id = $2,
        title = COALESCE($3, title),
        description = $4,
        event_type = COALESCE($5, event_type),
        start_time = COALESCE($6, start_time),
        end_time = $7,
        status = COALESCE($8, status),
        priority = COALESCE($9, priority),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        course_id || null,
        title || null,
        description ?? null,
        event_type || null,
        start_time || null,
        end_time || null,
        status || null,
        priority || null,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kế hoạch học tập",
      });
    }

    return res.json({
      success: true,
      message: "Cập nhật kế hoạch học tập thành công",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("updateStudyPlanEvent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật kế hoạch học tập",
      error: error?.message || String(error),
      code: error?.code,
    });
  }
}

export async function deleteStudyPlanEvent(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      DELETE FROM study_plan_events
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kế hoạch học tập",
      });
    }

    return res.json({
      success: true,
      message: "Xóa kế hoạch học tập thành công",
    });
  } catch (error: any) {
    console.error("deleteStudyPlanEvent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa kế hoạch học tập",
      error: error?.message || String(error),
      code: error?.code,
    });
  }
}

export async function completeStudyPlanEvent(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      UPDATE study_plan_events
      SET 
        status = 'completed',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kế hoạch học tập",
      });
    }

    return res.json({
      success: true,
      message: "Đã đánh dấu hoàn thành",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("completeStudyPlanEvent error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể hoàn thành kế hoạch học tập",
      error: error?.message || String(error),
      code: error?.code,
    });
  }
}