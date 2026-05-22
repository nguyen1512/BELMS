import { Request, Response } from "express";
import { db } from "../config/db";

type AuthRequest = Request & {
  user?: {
    id?: string;
  };
};

function getAuthUserId(req: Request) {
  return String((req as AuthRequest).user?.id || "");
}

export async function getQuizzesByCourse(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId || "");

    const result = await db.query(
      `
      SELECT
        id,
        course_id,
        title,
        description,
        pass_score,
        status,
        created_at
      FROM quizzes
      WHERE course_id = $1
      ORDER BY created_at DESC
      `,
      [courseId]
    );

    return res.json({
      message: "Lấy danh sách bài test thành công",
      quizzes: result.rows,
    });
  } catch (error) {
    console.error("Get quizzes error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy danh sách bài test",
    });
  }
}

export async function createQuiz(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId || "");
    const { title, description, pass_score, lesson_id,status } = req.body;

    if (!courseId) {
      return res.status(400).json({ message: "Thiếu ID khóa học" });
    }

    if (!title) {
      return res.status(400).json({ message: "Vui lòng nhập tên bài test" });
    }

    const result = await db.query(
    `
    INSERT INTO quizzes (
        course_id,
        lesson_id,
        title,
        description,
        pass_score,
        status
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, course_id, lesson_id, title, description, pass_score, status, created_at
    `,
    [
        courseId,
        lesson_id || null,
        title,
        description || null,
        pass_score || 70,
        status || "draft",
    ]
    );

    return res.status(201).json({
      message: "Tạo bài test thành công",
      quiz: result.rows[0],
    });
  } catch (error) {
    console.error("Create quiz error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo bài test",
    });
  }
}

export async function getQuizQuestions(req: Request, res: Response) {
  try {
    const quizId = String(req.params.quizId || "");

    const result = await db.query(
      `
      SELECT
        id,
        quiz_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        score,
        sort_order,
        created_at
      FROM quiz_questions
      WHERE quiz_id = $1
      ORDER BY sort_order ASC, created_at ASC
      `,
      [quizId]
    );

    return res.json({
      message: "Lấy danh sách câu hỏi thành công",
      questions: result.rows,
    });
  } catch (error) {
    console.error("Get quiz questions error:", error);
    return res.status(500).json({
      message: "Lỗi server khi lấy câu hỏi",
    });
  }
}

export async function createQuizQuestion(req: Request, res: Response) {
  try {
    const quizId = String(req.params.quizId || "");

    const {
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      score,
      sort_order,
    } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: "Thiếu ID bài test" });
    }

    if (!question_text || !option_a || !option_b || !correct_option) {
      return res.status(400).json({
        message: "Vui lòng nhập câu hỏi, đáp án A, B và đáp án đúng",
      });
    }

    if (!["A", "B", "C", "D"].includes(String(correct_option).toUpperCase())) {
      return res.status(400).json({
        message: "Đáp án đúng phải là A, B, C hoặc D",
      });
    }

    const result = await db.query(
      `
      INSERT INTO quiz_questions (
        quiz_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        score,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        quiz_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        score,
        sort_order,
        created_at
      `,
      [
        quizId,
        question_text,
        option_a,
        option_b,
        option_c || null,
        option_d || null,
        String(correct_option).toUpperCase(),
        score || 1,
        sort_order || 1,
      ]
    );

    return res.status(201).json({
      message: "Tạo câu hỏi thành công",
      question: result.rows[0],
    });
  } catch (error) {
    console.error("Create quiz question error:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo câu hỏi",
    });
  }
}

export async function submitQuiz(req: Request, res: Response) {
  try {
    const quizId = String(req.params.quizId || "");
    const userId = getAuthUserId(req);
    const { answers } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: "Thiếu ID bài test" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Bạn chưa đăng nhập" });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        message: "answers phải là một mảng",
      });
    }

    const quizResult = await db.query(
      `
      SELECT id, pass_score
      FROM quizzes
      WHERE id = $1
      LIMIT 1
      `,
      [quizId]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy bài test",
      });
    }

    const questionsResult = await db.query(
      `
      SELECT id, correct_option, score
      FROM quiz_questions
      WHERE quiz_id = $1
      `,
      [quizId]
    );

    const questions = questionsResult.rows;

    let score = 0;
    let totalScore = 0;

    for (const question of questions) {
      totalScore += Number(question.score || 1);

      const userAnswer = answers.find(
        (item: { question_id: string; selected_option: string }) =>
          item.question_id === question.id
      );

      if (
        userAnswer &&
        String(userAnswer.selected_option).toUpperCase() ===
          String(question.correct_option).toUpperCase()
      ) {
        score += Number(question.score || 1);
      }
    }

    const percent = totalScore === 0 ? 0 : Math.round((score / totalScore) * 100);
    const passed = percent >= Number(quizResult.rows[0].pass_score || 70);

    const attemptResult = await db.query(
      `
      INSERT INTO quiz_attempts (
        quiz_id,
        user_id,
        score,
        total_score,
        passed
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, quiz_id, user_id, score, total_score, passed, submitted_at
      `,
      [quizId, userId, score, totalScore, passed]
    );

    return res.json({
      message: "Nộp bài test thành công",
      result: {
        attempt: attemptResult.rows[0],
        score,
        totalScore,
        percent,
        passed,
      },
    });
  } catch (error) {
    console.error("Submit quiz error:", error);
    return res.status(500).json({
      message: "Lỗi server khi nộp bài test",
    });
  }
}