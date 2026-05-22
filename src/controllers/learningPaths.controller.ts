import { Request, Response } from "express";
import { db } from "../config/db";

type LearningLevelPayload = {
  level?: number;
  level_number?: number;
  position: string;
  competency: string;
  courseIds?: string[];
  course_ids?: string[];
};

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeCourseIdsFromLevel(level: any): string[] {
  const rawCourseIds =
    level.courseIds ||
    level.course_ids ||
    level.courseids ||
    level.courses ||
    [];

  if (!Array.isArray(rawCourseIds)) {
    return [];
  }

  return rawCourseIds.map((courseId: any) => String(courseId));
}

function normalizeCourseIds(level: LearningLevelPayload) {
  return level.courseIds || level.course_ids || [];
}

function normalizeLevelNumber(level: LearningLevelPayload, index: number) {
  return level.level || level.level_number || index + 1;
}

export const getLearningPaths = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        lp.id,
        lp.title,
        lp.department,
        lp.type,
        lp.deadline,
        lp.objective,
        lp.progress,
        lp.learners,
        lp.created_at,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', lpl.id,
              'level', lpl.level_number,
              'position', lpl.position,
              'competency', lpl.competency,
              'courseIds', COALESCE(level_courses.course_ids, '[]'::json)
            )
          ) FILTER (WHERE lpl.id IS NOT NULL),
          '[]'
        ) AS levels,
        COALESCE(course_count.total_courses, 0)::int AS courses
      FROM learning_paths lp
      LEFT JOIN learning_path_levels lpl
        ON lpl.learning_path_id = lp.id
      LEFT JOIN LATERAL (
        SELECT json_agg(lplc.course_id) AS course_ids
        FROM learning_path_level_courses lplc
        WHERE lplc.learning_path_level_id = lpl.id
      ) level_courses ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_courses
        FROM learning_path_levels lpl2
        JOIN learning_path_level_courses lplc2
          ON lplc2.learning_path_level_id = lpl2.id
        WHERE lpl2.learning_path_id = lp.id
      ) course_count ON true
      GROUP BY
        lp.id,
        course_count.total_courses
      ORDER BY lp.created_at DESC;
    `;

    const result = await db.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET learning paths error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách lộ trình học tập",
    });
  }
};

export const getLearningPathById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT
        lp.id,
        lp.title,
        lp.department,
        lp.type,
        lp.deadline,
        lp.objective,
        lp.progress,
        lp.learners,
        lp.created_at,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', lpl.id,
              'level', lpl.level_number,
              'position', lpl.position,
              'competency', lpl.competency,
              'courseIds', COALESCE(level_courses.course_ids, '[]'::json)
            )
          ) FILTER (WHERE lpl.id IS NOT NULL),
          '[]'
        ) AS levels,
        COALESCE(course_count.total_courses, 0)::int AS courses
      FROM learning_paths lp
      LEFT JOIN learning_path_levels lpl
        ON lpl.learning_path_id = lp.id
      LEFT JOIN LATERAL (
        SELECT json_agg(lplc.course_id) AS course_ids
        FROM learning_path_level_courses lplc
        WHERE lplc.learning_path_level_id = lpl.id
      ) level_courses ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_courses
        FROM learning_path_levels lpl2
        JOIN learning_path_level_courses lplc2
          ON lplc2.learning_path_level_id = lpl2.id
        WHERE lpl2.learning_path_id = lp.id
      ) course_count ON true
      WHERE lp.id = $1
      GROUP BY
        lp.id,
        course_count.total_courses;
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lộ trình học tập",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GET learning path by id error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể lấy chi tiết lộ trình học tập",
    });
  }
};

export const createLearningPath = async (req: Request, res: Response) => {
  const client = await db.connect();

  try {
    const { title, department, type, deadline, objective, levels } = req.body;

    if (!title || !department || !type) {
      return res.status(400).json({
        success: false,
        message: "Thiếu tên lộ trình, phòng ban hoặc loại lộ trình",
      });
    }

    if (!Array.isArray(levels) || levels.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Lộ trình cần có ít nhất một bậc năng lực",
      });
    }

    for (let index = 0; index < levels.length; index++) {
        const level = levels[index];
        const courseIds = normalizeCourseIdsFromLevel(level);

        if (!courseIds.length) {
            return res.status(400).json({
            success: false,
            message: `Bậc ${index + 1} chưa có khóa học được chọn`,
            });
        }

        const invalidCourseId = courseIds.find((courseId) => !isValidUUID(courseId));

        if (invalidCourseId) {
            return res.status(400).json({
            success: false,
            message: `courseId không hợp lệ ở bậc ${
                index + 1
            }: ${invalidCourseId}. FE phải gửi id thật dạng UUID từ bảng courses.`,
            });
        }
        }
        
    await client.query("BEGIN");

    const pathResult = await client.query(
        `
        INSERT INTO learning_paths (
            name,
            title,
            department,
            type,
            deadline,
            description,
            objective,
            status,
            progress,
            learners
        )
        VALUES ($1, $1, $2, $3, $4, $5, $5, 'active', 0, 0)
        RETURNING *;
        `,
        [
            title,
            department,
            type,
            deadline || null,
            objective || null,
        ]
        );
    const learningPath = pathResult.rows[0];

    for (let index = 0; index < levels.length; index++) {
      const level: LearningLevelPayload = levels[index];

      if (!level.position || !level.competency) {
        throw new Error(`Bậc ${index + 1} thiếu chức danh hoặc yêu cầu năng lực`);
      }

      const levelResult = await client.query(
        `
        INSERT INTO learning_path_levels (
          learning_path_id,
          level_number,
          position,
          competency
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *;
        `,
        [
          learningPath.id,
          normalizeLevelNumber(level, index),
          level.position,
          level.competency,
        ]
      );

      const createdLevel = levelResult.rows[0];
      const courseIds = normalizeCourseIds(level);

      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        throw new Error(`Bậc ${index + 1} chưa được gán khóa học`);
      }

      for (const courseId of courseIds) {
        await client.query(
          `
          INSERT INTO learning_path_level_courses (
            learning_path_level_id,
            course_id
          )
          VALUES ($1, $2)
          ON CONFLICT (learning_path_level_id, course_id) DO NOTHING;
          `,
          [createdLevel.id, courseId]
        );
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Tạo lộ trình học tập thành công",
      data: learningPath,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    console.error("CREATE learning path error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể tạo lộ trình học tập",
    });
  } finally {
    client.release();
  }
};

export const updateLearningPath = async (req: Request, res: Response) => {
  const { id } = req.params;
  const client = await db.connect();

  try {
    const { title, department, type, deadline, objective, levels } = req.body;

    if (!title || !department || !type) {
      return res.status(400).json({
        success: false,
        message: "Thiếu tên lộ trình, phòng ban hoặc loại lộ trình",
      });
    }

    await client.query("BEGIN");

    const updateResult = await client.query(
        `
        UPDATE learning_paths
        SET
            title = $1,
            department = $2,
            type = $3,
            deadline = $4,
            objective = $5,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *;
        `,
        [title, department, type, deadline || null, objective || null, id]
        );

    if (updateResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lộ trình học tập",
      });
    }

    await client.query(
      `
      DELETE FROM learning_path_levels
      WHERE learning_path_id = $1;
      `,
      [id]
    );

    if (Array.isArray(levels)) {
      for (let index = 0; index < levels.length; index++) {
        const level: LearningLevelPayload = levels[index];

        const levelResult = await client.query(
          `
          INSERT INTO learning_path_levels (
            learning_path_id,
            level_number,
            position,
            competency
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *;
          `,
          [
            id,
            normalizeLevelNumber(level, index),
            level.position,
            level.competency,
          ]
        );

        const createdLevel = levelResult.rows[0];
        const courseIds = normalizeCourseIds(level);

        for (const courseId of courseIds) {
          await client.query(
            `
            INSERT INTO learning_path_level_courses (
              learning_path_level_id,
              course_id
            )
            VALUES ($1, $2)
            ON CONFLICT (learning_path_level_id, course_id) DO NOTHING;
            `,
            [createdLevel.id, courseId]
          );
        }
      }
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Cập nhật lộ trình học tập thành công",
      data: updateResult.rows[0],
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    console.error("UPDATE learning path error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Không thể cập nhật lộ trình học tập",
    });
  } finally {
    client.release();
  }
};

export const deleteLearningPath = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `
      DELETE FROM learning_paths
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lộ trình học tập",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa lộ trình học tập thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("DELETE learning path error:", error);

    return res.status(500).json({
      success: false,
      message: "Không thể xóa lộ trình học tập",
    });
  }
};