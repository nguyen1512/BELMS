import { Request, Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { db } from "../config/db";

const upload = multer({
  dest: path.join(__dirname, "../../uploads"),
});

export const uploadQuestionBankMiddleware = upload.single("file");

function normalizeCorrectOption(value: string) {
  const v = String(value || "").trim().toUpperCase();

  if (["A", "B", "C", "D"].includes(v)) {
    return v;
  }

  if (["OPTION_A", "1", "ĐÁP ÁN A", "DAP AN A"].includes(v)) return "A";
  if (["OPTION_B", "2", "ĐÁP ÁN B", "DAP AN B"].includes(v)) return "B";
  if (["OPTION_C", "3", "ĐÁP ÁN C", "DAP AN C"].includes(v)) return "C";
  if (["OPTION_D", "4", "ĐÁP ÁN D", "DAP AN D"].includes(v)) return "D";

  return v;
}

async function getBankWithQuestionCount(bankId: string) {
  const result = await db.query(
    `
    SELECT
      qb.*,
      qbc.name AS category_name,
      COUNT(qbq.id)::int AS question_count
    FROM question_banks qb
    LEFT JOIN question_bank_categories qbc
      ON qbc.id = qb.category_id
    LEFT JOIN question_bank_questions qbq
      ON qbq.bank_id = qb.id
    WHERE qb.id = $1
    GROUP BY qb.id, qbc.name
    `,
    [bankId]
  );

  return result.rows[0] || null;
}

export async function getQuestionBankCategories(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT *
      FROM question_bank_categories
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      categories: result.rows,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getQuestionBankCategories error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy danh mục kho câu hỏi",
      error: error?.message || "Unknown error",
    });
  }
}

export async function createQuestionBank(req: Request, res: Response) {
  try {
    const { category_id, title, description, bank_type, status } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên kho câu hỏi",
      });
    }

    const result = await db.query(
      `
      INSERT INTO question_banks (
        category_id,
        title,
        description,
        bank_type,
        status,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
      RETURNING *
      `,
      [
        category_id || null,
        String(title).trim(),
        description || null,
        bank_type || "quiz",
        status || "active",
      ]
    );

    return res.json({
      success: true,
      message: "Tạo kho câu hỏi thành công",
      bank: {
        ...result.rows[0],
        question_count: 0,
      },
      data: {
        ...result.rows[0],
        question_count: 0,
      },
    });
  } catch (error: any) {
    console.error("createQuestionBank error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi tạo kho câu hỏi",
      error: error?.message || "Unknown error",
    });
  }
}

export async function getQuestionBanks(req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT
        qb.id,
        qb.category_id,
        qb.title,
        qb.description,
        qb.bank_type,
        qb.status,
        qb.created_at,
        qb.updated_at,
        qbc.name AS category_name,
        COUNT(qbq.id)::int AS question_count
      FROM question_banks qb
      LEFT JOIN question_bank_categories qbc
        ON qbc.id = qb.category_id
      LEFT JOIN question_bank_questions qbq
        ON qbq.bank_id = qb.id
      GROUP BY
        qb.id,
        qbc.name
      ORDER BY qb.created_at DESC
    `);

    return res.json({
      success: true,
      banks: result.rows,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getQuestionBanks error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy kho câu hỏi",
      error: error?.message || "Unknown error",
    });
  }
}

export async function uploadQuestionBankFile(req: Request, res: Response) {
  const client = await db.connect();

  try {
    const rawBankId = req.params.bankId;
    const bankId = Array.isArray(rawBankId)
      ? rawBankId[0]
      : String(rawBankId || "");

    const replace =
      String(req.body?.replace || req.query?.replace || "false") === "true";

    if (!bankId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu bankId",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Chưa upload file",
      });
    }

    const bankCheck = await client.query(
      `
      SELECT id
      FROM question_banks
      WHERE id = $1
      `,
      [bankId]
    );

    if (bankCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy kho câu hỏi",
      });
    }

    const content = fs.readFileSync(req.file.path, "utf-8");

    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let inserted = 0;
    let skipped = 0;

    await client.query("BEGIN");

    if (replace) {
      await client.query(
        `
        DELETE FROM question_bank_questions
        WHERE bank_id = $1
        `,
        [bankId]
      );
    }

    for (const line of lines) {
      const parts = line.split("|").map((item) => item.trim());

      if (parts.length < 6) {
        skipped++;
        continue;
      }

      const [question, optionA, optionB, optionC, optionD, correct] = parts;

      if (!question || !optionA || !optionB || !correct) {
        skipped++;
        continue;
      }

      const correctOption = normalizeCorrectOption(correct);

      if (!["A", "B", "C", "D"].includes(correctOption)) {
        skipped++;
        continue;
      }

      await client.query(
        `
        INSERT INTO question_bank_questions (
          bank_id,
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          correct_option,
          score,
          difficulty,
          sort_order,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
        `,
        [
          bankId,
          question,
          optionA,
          optionB,
          optionC || null,
          optionD || null,
          correctOption,
          1,
          "medium",
          inserted + 1,
        ]
      );

      inserted++;
    }

    await client.query(
      `
      UPDATE question_banks
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [bankId]
    );

    await client.query("COMMIT");

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const bank = await getBankWithQuestionCount(String(bankId));

    return res.json({
      success: true,
      message: "Upload bộ câu hỏi thành công",
      inserted,
      skipped,
      bank,
      data: bank,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error("uploadQuestionBankFile error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi upload bộ câu hỏi",
      error: error?.message || "Unknown error",
    });
  } finally {
    client.release();
  }
}

export async function getQuestionBankQuestions(req: Request, res: Response) {
  try {
    const rawBankId = req.params.bankId;
    const bankId = Array.isArray(rawBankId) ? rawBankId[0] : String(rawBankId || "");

    if (!bankId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu bankId",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        bank_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        score,
        difficulty,
        skill_tag,
        sort_order,
        created_at,
        updated_at
      FROM question_bank_questions
      WHERE bank_id = $1
      ORDER BY sort_order ASC, created_at ASC
      `,
      [bankId]
    );

    return res.json({
      success: true,
      questions: result.rows,
      data: result.rows,
    });
  } catch (error: any) {
    console.error("getQuestionBankQuestions error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi lấy câu hỏi",
      error: error?.message || "Unknown error",
    });
  }
}

export async function getRandomQuestions(req: Request, res: Response) {
  try {
    const { bankIds, limit } = req.query;

    const ids = String(bankIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const questionLimit = Number(limit || 10);

    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn ít nhất 1 kho câu hỏi",
      });
    }

    if (!Number.isFinite(questionLimit) || questionLimit <= 0) {
      return res.status(400).json({
        success: false,
        message: "Số lượng câu hỏi không hợp lệ",
      });
    }

    const result = await db.query(
      `
      SELECT
        id,
        bank_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        score,
        difficulty,
        skill_tag,
        sort_order,
        created_at,
        updated_at
      FROM question_bank_questions
      WHERE bank_id = ANY($1::uuid[])
      ORDER BY RANDOM()
      LIMIT $2
      `,
      [ids, questionLimit]
    );

    return res.json({
      success: true,
      questions: result.rows,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("getRandomQuestions error:", error);

    return res.status(500).json({
      success: false,
      message: "Lỗi random câu hỏi",
      error: error?.message || "Unknown error",
    });
  }
}