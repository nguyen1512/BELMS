import { Request, Response } from "express";
import { db } from "../config/db";

export async function getLmsDashboard(req: Request, res: Response) {
  try {
    const [users, courses, enrollments, completed, learnedMinutes, recentCourses, recentEnrollments] =
      await Promise.all([
        db.query(`SELECT COUNT(*)::int AS total FROM users`),
        db.query(`SELECT COUNT(*)::int AS total FROM courses`),
        db.query(`SELECT COUNT(*)::int AS total FROM enrollments`),
        db.query(`SELECT COUNT(*)::int AS total FROM enrollments WHERE status = 'completed'`),
        db.query(`
          SELECT COALESCE(SUM(l.duration_minutes), 0)::int AS total
          FROM lesson_progress lp
          JOIN lessons l ON l.id = lp.lesson_id
          WHERE lp.status = 'completed'
        `),
        db.query(`
          SELECT id, title, level, status, duration_minutes, created_at
          FROM courses
          ORDER BY created_at DESC
          LIMIT 5
        `),
        db.query(`
          SELECT
            e.id,
            e.progress_percent,
            e.status,
            e.enrolled_at,
            u.full_name,
            u.email,
            c.title AS course_title
          FROM enrollments e
          JOIN users u ON u.id = e.user_id
          JOIN courses c ON c.id = e.course_id
          ORDER BY e.enrolled_at DESC
          LIMIT 8
        `),
      ]);

    const totalEnrollments = enrollments.rows[0].total || 0;
    const totalCompleted = completed.rows[0].total || 0;

    return res.json({
      message: "Lấy dashboard LMS thành công",
      stats: {
        totalUsers: users.rows[0].total || 0,
        totalCourses: courses.rows[0].total || 0,
        learnedHours: Number(((learnedMinutes.rows[0].total || 0) / 60).toFixed(2)),
        completionRate:
          totalEnrollments === 0
            ? 0
            : Math.round((totalCompleted / totalEnrollments) * 100),
      },
      recentCourses: recentCourses.rows,
      recentEnrollments: recentEnrollments.rows,
    });
  } catch (error) {
    console.error("LMS dashboard error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy dashboard LMS",
    });
  }
}