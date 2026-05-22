import { Request, Response } from "express";
import { db } from "../config/db";

type SubmitAnswer = {
  questionId: string;
  selectedAnswerId: string | null;
};

type QuestionAnswerInput = {
  id?: string;
  answerText: string;
  isCorrect: boolean;
};

export const getRandomEntranceTestQuestions = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 10);

    const questionsResult = await db.query(
      `
      SELECT 
        q.id,
        q.question_text,
        q.category,
        q.difficulty
      FROM entrance_test_questions q
      WHERE q.status = 'active'
      ORDER BY RANDOM()
      LIMIT $1
      `,
      [limit]
    );

    const questions = questionsResult.rows;

    if (questions.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Chưa có câu hỏi Test đầu vào",
        data: [],
      });
    }

    const questionIds = questions.map((item) => item.id);

    const answersResult = await db.query(
      `
      SELECT 
        id,
        question_id,
        answer_text,
        sort_order
      FROM entrance_test_answers
      WHERE question_id = ANY($1::uuid[])
      ORDER BY question_id, sort_order ASC, created_at ASC
      `,
      [questionIds]
    );

    const answers = answersResult.rows;

    const data = questions.map((question) => ({
      id: question.id,
      questionText: question.question_text,
      category: question.category,
      difficulty: question.difficulty,
      answers: answers
        .filter((answer) => answer.question_id === question.id)
        .map((answer) => ({
          id: answer.id,
          answerText: answer.answer_text,
          sortOrder: answer.sort_order,
        })),
    }));

    return res.status(200).json({
      success: true,
      message: "Lấy random câu hỏi Test đầu vào thành công",
      data,
    });
  } catch (error) {
    console.error("getRandomEntranceTestQuestions error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy câu hỏi Test đầu vào",
    });
  }
};

export const checkEntranceTestAnswer = async (req: Request, res: Response) => {
  try {
    const { questionId, answerId } = req.body;

    if (!questionId || !answerId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu questionId hoặc answerId",
      });
    }

    const selectedResult = await db.query(
      `
      SELECT 
        id,
        question_id,
        answer_text,
        is_correct
      FROM entrance_test_answers
      WHERE question_id = $1
        AND id = $2
      LIMIT 1
      `,
      [questionId, answerId]
    );

    if (selectedResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đáp án",
      });
    }

    const selectedAnswer = selectedResult.rows[0];

    const correctResult = await db.query(
      `
      SELECT 
        id,
        answer_text
      FROM entrance_test_answers
      WHERE question_id = $1
        AND is_correct = TRUE
      ORDER BY sort_order ASC
      LIMIT 1
      `,
      [questionId]
    );

    return res.status(200).json({
      success: true,
      message: "Kiểm tra đáp án thành công",
      data: {
        questionId,
        selectedAnswerId: selectedAnswer.id,
        isCorrect: selectedAnswer.is_correct === true,
        correctAnswer: correctResult.rows[0]
          ? {
              id: correctResult.rows[0].id,
              answerText: correctResult.rows[0].answer_text,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("checkEntranceTestAnswer error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi kiểm tra đáp án",
    });
  }
};

export const submitEntranceTest = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const { userId, answers } = req.body as {
      userId: string;
      answers: SubmitAnswer[];
    };

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Chưa có câu trả lời để nộp bài",
      });
    }

    await client.query("BEGIN");

    const selectedAnswerIds = answers
      .map((item) => item.selectedAnswerId)
      .filter((item): item is string => Boolean(item));

    const correctMap = new Map<string, boolean>();

    if (selectedAnswerIds.length > 0) {
      const answerResult = await client.query(
        `
        SELECT 
          id,
          is_correct
        FROM entrance_test_answers
        WHERE id = ANY($1::uuid[])
        `,
        [selectedAnswerIds]
      );

      answerResult.rows.forEach((row) => {
        correctMap.set(row.id, row.is_correct === true);
      });
    }

    const totalQuestions = answers.length;

    const correctAnswers = answers.filter((item) => {
      if (!item.selectedAnswerId) return false;
      return correctMap.get(item.selectedAnswerId) === true;
    }).length;

    const score =
      totalQuestions > 0
        ? Number(((correctAnswers / totalQuestions) * 10).toFixed(2))
        : 0;

    const attemptResult = await client.query(
      `
      INSERT INTO entrance_test_attempts (
        user_id,
        total_questions,
        correct_answers,
        score,
        status,
        started_at,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, 'completed', NOW(), NOW())
      RETURNING 
        id,
        user_id,
        total_questions,
        correct_answers,
        score,
        status,
        submitted_at
      `,
      [userId, totalQuestions, correctAnswers, score]
    );

    const attempt = attemptResult.rows[0];

    for (const item of answers) {
      const isCorrect = item.selectedAnswerId
        ? correctMap.get(item.selectedAnswerId) === true
        : false;

      await client.query(
        `
        INSERT INTO entrance_test_attempt_details (
          attempt_id,
          question_id,
          selected_answer_id,
          is_correct,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [attempt.id, item.questionId, item.selectedAnswerId, isCorrect]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Nộp bài Test đầu vào thành công",
      data: {
        attemptId: attempt.id,
        userId: attempt.user_id,
        totalQuestions: attempt.total_questions,
        correctAnswers: attempt.correct_answers,
        score: Number(attempt.score),
        status: attempt.status,
        submittedAt: attempt.submitted_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("submitEntranceTest error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi nộp bài Test đầu vào",
    });
  } finally {
    client.release();
  }
};

export const getMyEntranceTestHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu userId",
      });
    }

    const result = await db.query(
      `
      SELECT 
        id,
        user_id,
        total_questions,
        correct_answers,
        score,
        status,
        submitted_at
      FROM entrance_test_attempts
      WHERE user_id = $1
      ORDER BY submitted_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "Lấy lịch sử Test đầu vào thành công",
      data: result.rows.map((item) => ({
        id: item.id,
        userId: item.user_id,
        totalQuestions: item.total_questions,
        correctAnswers: item.correct_answers,
        score: Number(item.score),
        status: item.status,
        submittedAt: item.submitted_at,
      })),
    });
  } catch (error) {
    console.error("getMyEntranceTestHistory error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử Test đầu vào",
    });
  }
};

export const getEntranceTestQuestionBank = async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `
      SELECT 
        q.id,
        q.question_text,
        q.category,
        q.difficulty,
        q.status,
        q.created_at,
        q.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'answerText', a.answer_text,
              'isCorrect', a.is_correct,
              'sortOrder', a.sort_order
            )
            ORDER BY a.sort_order ASC
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS answers
      FROM entrance_test_questions q
      LEFT JOIN entrance_test_answers a 
        ON a.question_id = q.id
      GROUP BY q.id
      ORDER BY q.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      message: "Lấy kho câu hỏi Test đầu vào thành công",
      data: result.rows.map((item) => ({
        id: item.id,
        questionText: item.question_text,
        category: item.category,
        difficulty: item.difficulty,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        answers: item.answers || [],
      })),
    });
  } catch (error) {
    console.error("getEntranceTestQuestionBank error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy kho câu hỏi Test đầu vào",
    });
  }
};

export const createEntranceTestQuestion = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const {
      questionText,
      category = "general",
      difficulty = "basic",
      answers,
    } = req.body as {
      questionText: string;
      category?: string;
      difficulty?: string;
      answers: QuestionAnswerInput[];
    };

    if (!questionText || !questionText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Thiếu nội dung câu hỏi",
      });
    }

    if (!Array.isArray(answers) || answers.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Câu hỏi cần tối thiểu 2 đáp án",
      });
    }

    const hasCorrectAnswer = answers.some((answer) => answer.isCorrect === true);

    if (!hasCorrectAnswer) {
      return res.status(400).json({
        success: false,
        message: "Cần chọn ít nhất 1 đáp án đúng",
      });
    }

    await client.query("BEGIN");

    const questionResult = await client.query(
      `
      INSERT INTO entrance_test_questions (
        question_text,
        category,
        difficulty,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'active', NOW(), NOW())
      RETURNING *
      `,
      [questionText.trim(), category, difficulty]
    );

    const question = questionResult.rows[0];

    for (let index = 0; index < answers.length; index++) {
      const answer = answers[index];

      if (!answer.answerText || !answer.answerText.trim()) {
        continue;
      }

      await client.query(
        `
        INSERT INTO entrance_test_answers (
          question_id,
          answer_text,
          is_correct,
          sort_order,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [question.id, answer.answerText.trim(), answer.isCorrect === true, index + 1]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Tạo câu hỏi Test đầu vào thành công",
      data: {
        id: question.id,
        questionText: question.question_text,
        category: question.category,
        difficulty: question.difficulty,
        status: question.status,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("createEntranceTestQuestion error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo câu hỏi Test đầu vào",
    });
  } finally {
    client.release();
  }
};

export const updateEntranceTestQuestion = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const { id } = req.params;

    const {
      questionText,
      category = "general",
      difficulty = "basic",
      status = "active",
      answers,
    } = req.body as {
      questionText: string;
      category?: string;
      difficulty?: string;
      status?: string;
      answers: QuestionAnswerInput[];
    };

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu id câu hỏi",
      });
    }

    if (!questionText || !questionText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Thiếu nội dung câu hỏi",
      });
    }

    if (!Array.isArray(answers) || answers.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Câu hỏi cần tối thiểu 2 đáp án",
      });
    }

    const hasCorrectAnswer = answers.some((answer) => answer.isCorrect === true);

    if (!hasCorrectAnswer) {
      return res.status(400).json({
        success: false,
        message: "Cần chọn ít nhất 1 đáp án đúng",
      });
    }

    await client.query("BEGIN");

    const questionResult = await client.query(
      `
      UPDATE entrance_test_questions
      SET 
        question_text = $1,
        category = $2,
        difficulty = $3,
        status = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
      `,
      [questionText.trim(), category, difficulty, status, id]
    );

    if (questionResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy câu hỏi",
      });
    }

    await client.query(
      `
      DELETE FROM entrance_test_answers
      WHERE question_id = $1
      `,
      [id]
    );

    for (let index = 0; index < answers.length; index++) {
      const answer = answers[index];

      if (!answer.answerText || !answer.answerText.trim()) {
        continue;
      }

      await client.query(
        `
        INSERT INTO entrance_test_answers (
          question_id,
          answer_text,
          is_correct,
          sort_order,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [id, answer.answerText.trim(), answer.isCorrect === true, index + 1]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Cập nhật câu hỏi Test đầu vào thành công",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("updateEntranceTestQuestion error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật câu hỏi Test đầu vào",
    });
  } finally {
    client.release();
  }
};

export const deleteEntranceTestQuestion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Thiếu id câu hỏi",
      });
    }

    const result = await db.query(
      `
      UPDATE entrance_test_questions
      SET 
        status = 'inactive',
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy câu hỏi",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đã ẩn câu hỏi Test đầu vào",
    });
  } catch (error) {
    console.error("deleteEntranceTestQuestion error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa câu hỏi Test đầu vào",
    });
  }
};