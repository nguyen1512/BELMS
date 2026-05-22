import { Request, Response } from "express";
import { db } from "../config/db";

function normalizeStatus(status?: string) {
  if (!status) return "draft";
  if (status === "active") return "published";
  return status;
}

function normalizeAssessmentType(type?: string) {
  return type || "lesson_quiz";
}

function normalizeCorrectOption(value?: string | null) {
  const option = String(value || "").trim().toUpperCase();
  if (["A", "B", "C", "D"].includes(option)) return option;
  return "A";
}

async function insertAssessmentQuestionsFromBanks(
  client: any,
  assessmentId: string,
  selectedBankIds: string[],
  limit: number
) {
  if (!Array.isArray(selectedBankIds) || selectedBankIds.length === 0) {
    return 0;
  }

  const safeLimit = Math.max(1, Number(limit || 10));

  const bankQuestionsResult = await client.query(
    `
    SELECT
      id,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      score,
      sort_order
    FROM question_bank_questions
    WHERE bank_id = ANY($1::uuid[])
    ORDER BY RANDOM()
    LIMIT $2
    `,
    [selectedBankIds, safeLimit]
  );

  for (let index = 0; index < bankQuestionsResult.rows.length; index += 1) {
    const sourceQuestion = bankQuestionsResult.rows[index];
    const correctOption = normalizeCorrectOption(sourceQuestion.correct_option);

    const questionResult = await client.query(
      `
      INSERT INTO questions (
        assessment_id,
        question_text,
        question_type,
        score,
        explanation,
        sort_order
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
      `,
      [
        assessmentId,
        sourceQuestion.question_text,
        "single_choice",
        Number(sourceQuestion.score || 1),
        null,
        index + 1,
      ]
    );

    const questionId = questionResult.rows[0].id;

    const options = [
      { key: "A", text: sourceQuestion.option_a },
      { key: "B", text: sourceQuestion.option_b },
      { key: "C", text: sourceQuestion.option_c },
      { key: "D", text: sourceQuestion.option_d },
    ].filter((item) => item.text && String(item.text).trim() !== "");

    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const option = options[optionIndex];

      await client.query(
        `
        INSERT INTO question_options (
          question_id,
          option_text,
          is_correct,
          sort_order
        )
        VALUES ($1,$2,$3,$4)
        `,
        [
          questionId,
          option.text,
          option.key === correctOption,
          optionIndex + 1,
        ]
      );
    }
  }

  return bankQuestionsResult.rows.length;
}

export async function getAssessmentCourses(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        id,
        title,
        code,
        status
      FROM courses
      ORDER BY created_at DESC
    `);

    return res.json({
      message: "Lấy danh sách khóa học thành công",
      courses: result.rows,
    });
  } catch (error: any) {
    console.error("getAssessmentCourses error:", error);
    return res.status(500).json({
      message: "Lỗi lấy danh sách khóa học",
      error: error?.message || "Unknown error",
    });
  }
}

export async function getLessonsByCourse(req: Request, res: Response) {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu courseId",
      });
    }

    const result = await db.query(
      `
      SELECT
        cl.id,
        cl.course_id,
        cl.module_id,
        cl.section_id,
        cl.title,
        cl.content AS description,
        cl.lesson_type,
        cl.video_url,
        cl.duration_minutes,
        cl.sort_order,
        cl.is_required,
        cl.created_at,
        cl.updated_at
      FROM course_lessons cl
      WHERE cl.course_id = $1
      ORDER BY cl.sort_order ASC, cl.created_at ASC
      `,
      [courseId]
    );

    return res.json({
      success: true,
      lessons: result.rows,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getLessonsByCourse error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy bài học theo khóa học",
      error: error?.message || "Unknown error",
      code: error?.code,
    });
  }
}

export async function getAssessments(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        a.id,
        a.course_id,
        a.lesson_id,
        a.title,
        a.description,
        a.assessment_type,
        a.pass_score,
        a.time_limit_minutes,
        a.max_attempts,
        a.status,
        a.created_by,
        a.created_at,
        a.updated_at,

        c.title AS course_title,
        cl.title AS lesson_title,

        COUNT(q.id)::int AS question_count

      FROM assessments a
      LEFT JOIN courses c
        ON c.id = a.course_id
      LEFT JOIN course_lessons cl
        ON cl.id = a.lesson_id
      LEFT JOIN questions q
        ON q.assessment_id = a.id

      GROUP BY
        a.id,
        c.title,
        cl.title

      ORDER BY a.created_at DESC
    `);

    return res.json({
      success: true,
      assessments: result.rows,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getAssessments error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy danh sách bài thi",
      error: error?.message || "Unknown error",
      code: error?.code,
    });
  }
}

export async function getAssessmentDetail(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const assessmentResult = await db.query(
      `
      SELECT
        a.*,
        c.title AS course_title,
        cl.title AS lesson_title
      FROM assessments a
      LEFT JOIN courses c
        ON c.id = a.course_id
      LEFT JOIN course_lessons cl
        ON cl.id = a.lesson_id
      WHERE a.id = $1
      `,
      [id]
    );

    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy bài thi" });
    }

    const questionsResult = await db.query(
      `
      SELECT
        q.id,
        q.assessment_id,
        q.question_text,
        q.question_type,
        q.score,
        q.explanation,
        q.sort_order,
        COALESCE(
          json_agg(
            json_build_object(
              'id', qo.id,
              'option_text', qo.option_text,
              'is_correct', qo.is_correct,
              'sort_order', qo.sort_order
            )
            ORDER BY qo.sort_order ASC
          ) FILTER (WHERE qo.id IS NOT NULL),
          '[]'::json
        ) AS options
      FROM questions q
      LEFT JOIN question_options qo ON qo.question_id = q.id
      WHERE q.assessment_id = $1
      GROUP BY q.id
      ORDER BY q.sort_order ASC, q.created_at ASC
      `,
      [id]
    );

    return res.json({
      message: "Lấy chi tiết bài thi thành công",
      assessment: {
        ...assessmentResult.rows[0],
        questions: questionsResult.rows,
      },
    });
  } catch (error: any) {
    console.error("getAssessmentDetail error:", error);
    return res.status(500).json({
      message: "Lỗi lấy chi tiết bài thi",
      error: error?.message || "Unknown error",
    });
  }
}

export async function createAssessment(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const {
      course_id,
      lesson_id,
      title,
      description,
      assessment_type,
      pass_score,
      time_limit_minutes,
      max_attempts,
      status,
      created_by,
      selected_bank_ids,
      random_question_limit,
    } = req.body;

    if (!course_id || !title) {
      return res.status(400).json({
        message: "Vui lòng chọn khóa học và nhập tên bài thi",
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `
      INSERT INTO assessments (
        course_id,
        lesson_id,
        title,
        description,
        assessment_type,
        pass_score,
        time_limit_minutes,
        max_attempts,
        status,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        course_id,
        lesson_id || null,
        title,
        description || null,
        normalizeAssessmentType(assessment_type),
        Number(pass_score || 80),
        Number(time_limit_minutes || 20),
        Number(max_attempts || 1),
        normalizeStatus(status),
        created_by || null,
      ]
    );

    const assessment = result.rows[0];

    const insertedQuestionCount = await insertAssessmentQuestionsFromBanks(
      client,
      assessment.id,
      Array.isArray(selected_bank_ids) ? selected_bank_ids : [],
      Number(random_question_limit || 10)
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Tạo bài thi thành công",
      assessment,
      inserted_question_count: insertedQuestionCount,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("createAssessment error:", error);
    return res.status(500).json({
      message: "Lỗi tạo bài thi",
      error: error?.message || "Unknown error",
    });
  } finally {
    client.release();
  }
}


export async function deleteAssessment(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const existed = await client.query(
      `SELECT id, title FROM assessments WHERE id = $1`,
      [id]
    );

    if (existed.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy bài thi / bài test" });
    }

    await client.query(
      `
      DELETE FROM question_options
      WHERE question_id IN (
        SELECT id FROM questions WHERE assessment_id = $1
      )
      `,
      [id]
    );

    await client.query(`DELETE FROM questions WHERE assessment_id = $1`, [id]);
    await client.query(`DELETE FROM exam_answers WHERE exam_session_id IN (SELECT id FROM exam_sessions WHERE assessment_id = $1)`, [id]);
    await client.query(`DELETE FROM exam_results WHERE assessment_id = $1`, [id]);
    await client.query(`DELETE FROM exam_sessions WHERE assessment_id = $1`, [id]);
    await client.query(`DELETE FROM assessments WHERE id = $1`, [id]);

    await client.query("COMMIT");

    return res.json({
      message: "Xóa bài thi / bài test thành công",
      deleted_id: id,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("deleteAssessment error:", error);
    return res.status(500).json({
      message: "Lỗi xóa bài thi / bài test",
      error: error?.message || "Unknown error",
    });
  } finally {
    client.release();
  }
}

export async function getAssessmentRandomQuestions(req: Request, res: Response) {
  try {
    const assessmentId = req.params.id;
    const limit = Number(req.query.limit || 10);

    const assessmentResult = await db.query(
      `
      SELECT id
      FROM assessments
      WHERE id = $1
      `,
      [assessmentId]
    );

    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy bài thi" });
    }

    const questionsResult = await db.query(
      `
      SELECT
        q.id,
        q.assessment_id,
        q.question_text,
        q.question_type,
        q.score,
        q.sort_order,
        COALESCE(
          json_agg(
            json_build_object(
              'id', qo.id,
              'option_text', qo.option_text,
              'is_correct', qo.is_correct,
              'sort_order', qo.sort_order
            )
            ORDER BY qo.sort_order ASC
          ) FILTER (WHERE qo.id IS NOT NULL),
          '[]'::json
        ) AS options
      FROM questions q
      LEFT JOIN question_options qo ON qo.question_id = q.id
      WHERE q.assessment_id = $1
      GROUP BY q.id
      ORDER BY RANDOM()
      LIMIT $2
      `,
      [assessmentId, limit]
    );

    return res.json({
      message: "Lấy câu hỏi ngẫu nhiên thành công",
      questions: questionsResult.rows,
    });
  } catch (error: any) {
    console.error("getAssessmentRandomQuestions error:", error);
    return res.status(500).json({
      message: "Lỗi lấy câu hỏi ngẫu nhiên",
      error: error?.message || "Unknown error",
    });
  }
}
