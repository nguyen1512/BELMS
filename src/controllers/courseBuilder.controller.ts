import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import { db } from "../config/db";
import cloudinary from "../config/cloudinary";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

export const uploadFile = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

function newId() {
  return crypto.randomUUID();
}

function isUUID(value: unknown): value is string {
  if (typeof value !== "string") return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function badUuid(res: Response, name: string, value: string) {
  return res.status(400).json({ message: `${name} không hợp lệ`, [name]: value });
}

function toDbStatus(status?: string) {
  if (status === "active" || status === "published") return "published";
  if (status === "review") return "review";
  return "draft";
}

function toFeStatus(status?: string) {
  if (status === "published" || status === "active") return "active";
  if (status === "review") return "review";
  return "draft";
}

function mapCourse(row: any) {
  return {
    id: row.id,
    title: row.title || "Khóa học chưa đặt tên",
    code: row.code || `COURSE-${String(row.id).slice(0, 8)}`,
    description: row.description || "",
    thumbnail_url: row.thumbnail_url || null,
    category: row.category_name || "Đào tạo nội bộ",
    category_id: row.category_id || null,
    instructor_id: row.instructor_id || null,
    lessons: Number(row.lesson_count || 0),
    completion: 0,
    status: toFeStatus(row.status),
    level: row.level || "Cơ bản",
    owner: "Admin LMS",
    duration_minutes: Number(row.duration_minutes || 0),
    course_type: row.course_type || "online",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLesson(row: any) {
  const hasVideo = Boolean(row.video_url);
  const hasQuiz = Boolean(row.quiz_id);
  const hasMaterial = Boolean(row.material_url);

  let type = row.lesson_type || "video";

  if (hasQuiz) type = "quiz";
  else if (hasVideo) type = "video";
  else if (hasMaterial && type !== "video") type = "resource";

  return {
    id: row.id,
    module_id: row.module_id || null,
    course_id: row.course_id,
    section_id: row.section_id,

    title: row.title || "Bài học chưa đặt tên",
    description: row.content || "",
    content: row.content || "",

    type,
    lesson_type: type,

    time: row.duration_minutes ? `${row.duration_minutes} phút` : "15 phút",
    duration_minutes: Number(row.duration_minutes || 15),

    required: row.is_required !== false,
    is_required: row.is_required !== false,

    video_url: row.video_url || null,
    content_url: row.video_url || row.material_url || null,

    material_url: row.material_url || null,
    assignment_url: row.material_url || null,
    library_resource_id: row.library_resource_id || null,

    quiz_id: row.quiz_id || null,
    quiz_title: row.quiz_title || null,
    quiz_pass_score: row.quiz_pass_score || null,
    quiz_time_limit_minutes: row.quiz_time_limit_minutes || null,
    quiz_max_attempts: row.quiz_max_attempts || null,

    sort_order: Number(row.sort_order || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getCourses(_req: Request, res: Response) {
  try {
    const result = await db.query(`
      SELECT 
        c.*,
        cc.name AS category_name,
        COUNT(l.id)::int AS lesson_count
      FROM courses c
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      LEFT JOIN course_lessons l ON l.course_id = c.id
      GROUP BY c.id, cc.name
      ORDER BY c.created_at DESC
    `);

    return res.json({ courses: result.rows.map(mapCourse) });
  } catch (error: any) {
    console.error("getCourses error:", error);
    return res.status(500).json({
      message: "Không lấy được danh sách khóa học",
      error: error.message,
    });
  }
}

export async function getCourseDetail(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId);
    if (!isUUID(courseId)) return badUuid(res, "courseId", courseId);

    const courseResult = await db.query(
      `
      SELECT 
        c.*,
        cc.name AS category_name,
        COUNT(l.id)::int AS lesson_count
      FROM courses c
      LEFT JOIN course_categories cc ON cc.id = c.category_id
      LEFT JOIN course_lessons l ON l.course_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, cc.name
      `,
      [courseId]
    );

    if (!courseResult.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    const sectionResult = await db.query(
      `
      SELECT *
      FROM course_sections
      WHERE course_id = $1
      ORDER BY sort_order ASC, created_at ASC
      `,
      [courseId]
    );

    const lessonResult = await db.query(
      `
      SELECT 
        l.*,
        cm.file_url AS material_url,
        cm.id AS library_resource_id,
        a.id AS quiz_id,
        a.title AS quiz_title,
        a.pass_score AS quiz_pass_score,
        a.time_limit_minutes AS quiz_time_limit_minutes,
        a.max_attempts AS quiz_max_attempts
      FROM course_lessons l
      LEFT JOIN LATERAL (
        SELECT id, file_url
        FROM course_materials
        WHERE lesson_id = l.id
        ORDER BY created_at DESC
        LIMIT 1
      ) cm ON true
      LEFT JOIN LATERAL (
        SELECT id, title, pass_score, time_limit_minutes, max_attempts
        FROM assessments
        WHERE lesson_id = l.id
        AND assessment_type = 'quiz'
        ORDER BY created_at DESC
        LIMIT 1
      ) a ON true
      WHERE l.course_id = $1
      ORDER BY l.section_id ASC, l.sort_order ASC, l.created_at ASC
      `,
      [courseId]
    );

    const sections = sectionResult.rows.map((section: any) => ({
      id: section.id,
      course_id: section.course_id,
      title: section.title,
      sort_order: section.sort_order,
      lessons: lessonResult.rows
        .filter((lesson: any) => String(lesson.section_id) === String(section.id))
        .map(mapLesson),
    }));

    return res.json({
      course: mapCourse(courseResult.rows[0]),
      sections,
    });
  } catch (error: any) {
    console.error("getCourseDetail error:", error);
    return res.status(500).json({
      message: "Không lấy được chi tiết khóa học",
      error: error.message,
    });
  }
}

export async function createCourse(req: Request, res: Response) {
  try {
    const {
      title,
      code,
      description,
      category_id,
      instructor_id,
      level,
      duration_minutes,
      course_type,
    } = req.body;

    if (!title) return res.status(400).json({ message: "Thiếu tên khóa học" });

    const courseId = newId();
    const sectionId = newId();
    const lessonId = newId();

    const courseResult = await db.query(
      `
      INSERT INTO courses (
        id,
        category_id,
        instructor_id,
        title,
        code,
        description,
        level,
        duration_minutes,
        course_type,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
      RETURNING *
      `,
      [
        courseId,
        isUUID(category_id) ? category_id : null,
        isUUID(instructor_id) ? instructor_id : null,
        title,
        code || `COURSE-${courseId.slice(0, 8)}`,
        description || "",
        level || "Cơ bản",
        Number(duration_minutes) || 0,
        course_type || "online",
      ]
    );

    const sectionResult = await db.query(
      `
      INSERT INTO course_sections (id, course_id, title, sort_order)
      VALUES ($1,$2,$3,1)
      RETURNING *
      `,
      [sectionId, courseId, "Phần 1: Nội dung khóa học"]
    );

    const lessonResult = await db.query(
      `
      INSERT INTO course_lessons (
        id,
        course_id,
        section_id,
        title,
        content,
        lesson_type,
        video_url,
        duration_minutes,
        sort_order,
        is_required
      )
      VALUES ($1,$2,$3,$4,'','video',NULL,15,1,true)
      RETURNING *
      `,
      [lessonId, courseId, sectionId, "Bài học đầu tiên"]
    );

    return res.status(201).json({
      course: mapCourse({
        ...courseResult.rows[0],
        lesson_count: 1,
        category_name: "Đào tạo nội bộ",
      }),
      sections: [
        {
          id: sectionResult.rows[0].id,
          course_id: sectionResult.rows[0].course_id,
          title: sectionResult.rows[0].title,
          sort_order: sectionResult.rows[0].sort_order,
          lessons: [mapLesson(lessonResult.rows[0])],
        },
      ],
    });
  } catch (error: any) {
    console.error("createCourse error:", error);
    return res.status(500).json({
      message: "Tạo khóa học thất bại",
      error: error.message,
    });
  }
}

export async function updateCourse(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId);
    if (!isUUID(courseId)) return badUuid(res, "courseId", courseId);

    const {
      title,
      code,
      description,
      category_id,
      instructor_id,
      level,
      duration_minutes,
      course_type,
      status,
    } = req.body;

    const result = await db.query(
      `
      UPDATE courses SET
        title = COALESCE($1, title),
        code = COALESCE($2, code),
        description = COALESCE($3, description),
        category_id = COALESCE($4, category_id),
        instructor_id = COALESCE($5, instructor_id),
        level = COALESCE($6, level),
        duration_minutes = COALESCE($7, duration_minutes),
        course_type = COALESCE($8, course_type),
        status = COALESCE($9, status),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
      `,
      [
        title || null,
        code || null,
        description ?? null,
        isUUID(category_id) ? category_id : null,
        isUUID(instructor_id) ? instructor_id : null,
        level || null,
        duration_minutes ?? null,
        course_type || null,
        status ? toDbStatus(status) : null,
        courseId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS lesson_count FROM course_lessons WHERE course_id = $1`,
      [courseId]
    );

    return res.json({
      course: mapCourse({
        ...result.rows[0],
        lesson_count: countResult.rows[0]?.lesson_count || 0,
      }),
    });
  } catch (error: any) {
    console.error("updateCourse error:", error);
    return res.status(500).json({
      message: "Cập nhật khóa học thất bại",
      error: error.message,
    });
  }
}

export async function publishCourse(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId);
    if (!isUUID(courseId)) return badUuid(res, "courseId", courseId);

    const result = await db.query(
      `
      UPDATE courses
      SET status = 'published', updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [courseId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    return res.json({ course: mapCourse(result.rows[0]) });
  } catch (error: any) {
    console.error("publishCourse error:", error);
    return res.status(500).json({
      message: "Publish khóa học thất bại",
      error: error.message,
    });
  }
}

export async function createSection(req: Request, res: Response) {
  try {
    const courseId = String(req.params.courseId);
    if (!isUUID(courseId)) return badUuid(res, "courseId", courseId);

    const { title, sort_order } = req.body;

    const courseCheck = await db.query(`SELECT id FROM courses WHERE id = $1`, [courseId]);
    if (!courseCheck.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM course_sections WHERE course_id = $1`,
      [courseId]
    );

    const nextOrder = Number(sort_order) || Number(countResult.rows[0]?.total || 0) + 1;
    const sectionId = newId();

    const result = await db.query(
      `
      INSERT INTO course_sections (id, course_id, title, sort_order)
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [sectionId, courseId, title || `Phần ${nextOrder}: Nội dung mới`, nextOrder]
    );

    return res.status(201).json({
      message: "Tạo section thành công",
      section: {
        id: result.rows[0].id,
        course_id: result.rows[0].course_id,
        title: result.rows[0].title,
        sort_order: result.rows[0].sort_order,
        lessons: [],
      },
    });
  } catch (error: any) {
    console.error("createSection error:", error);
    return res.status(500).json({
      message: "Tạo section thất bại",
      error: error.message,
    });
  }
}

export async function createLesson(req: Request, res: Response) {
  try {
    const sectionId = String(req.params.sectionId);
    if (!isUUID(sectionId)) return badUuid(res, "sectionId", sectionId);

    const {
      title,
      content,
      description,
      lesson_type,
      content_type,
      duration_minutes,
      is_required,
    } = req.body;

    const sectionResult = await db.query(
      `SELECT id, course_id FROM course_sections WHERE id = $1`,
      [sectionId]
    );

    if (!sectionResult.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy section" });
    }

    const courseId = sectionResult.rows[0].course_id;

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM course_lessons WHERE section_id = $1`,
      [sectionId]
    );

    const sortOrder = Number(countResult.rows[0]?.total || 0) + 1;

    const result = await db.query(
      `
      INSERT INTO course_lessons (
        id,
        course_id,
        section_id,
        title,
        content,
        lesson_type,
        video_url,
        duration_minutes,
        sort_order,
        is_required
      )
      VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9)
      RETURNING *
      `,
      [
        newId(),
        courseId,
        sectionId,
        title || `Bài học mới ${sortOrder}`,
        content ?? description ?? "",
        lesson_type || content_type || "video",
        Number(duration_minutes) || 15,
        sortOrder,
        is_required ?? true,
      ]
    );

    return res.status(201).json({
      message: "Tạo bài học thành công",
      lesson: mapLesson(result.rows[0]),
    });
  } catch (error: any) {
    console.error("createLesson error:", error);
    return res.status(500).json({
      message: "Tạo bài học thất bại",
      error: error.message,
      detail: error.detail,
      code: error.code,
    });
  }
}

export async function updateLesson(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    const {
      title,
      content,
      description,
      lesson_type,
      content_type,
      duration_minutes,
      is_required,
      video_url,
      content_url,
    } = req.body;

    const result = await db.query(
      `
      UPDATE course_lessons
      SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        lesson_type = COALESCE($3, lesson_type),
        duration_minutes = COALESCE($4, duration_minutes),
        is_required = COALESCE($5, is_required),
        video_url = COALESCE($6, video_url),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
      `,
      [
        title || null,
        content ?? description ?? null,
        lesson_type || content_type || null,
        duration_minutes ?? null,
        is_required ?? null,
        video_url || content_url || null,
        lessonId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    return res.json({ lesson: mapLesson(result.rows[0]) });
  } catch (error: any) {
    return res.status(500).json({
      message: "Cập nhật bài học thất bại",
      error: error.message,
    });
  }
}

export async function deleteLesson(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    const result = await db.query(
      `DELETE FROM course_lessons WHERE id = $1 RETURNING *`,
      [lessonId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    return res.json({ message: "Đã xóa bài học" });
  } catch (error: any) {
    console.error("deleteLesson error:", error);
    return res.status(500).json({
      message: "Xóa bài học thất bại",
      error: error.message,
    });
  }
}

export async function uploadLessonVideo(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    if (!req.file) {
      return res.status(400).json({ message: "Chưa chọn video" });
    }

    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "anu-lms/videos",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    const cloudinaryUrl = uploadResult.secure_url;

    const result = await db.query(
      `
      UPDATE course_lessons
      SET 
        lesson_type = 'video',
        video_url = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [cloudinaryUrl, lessonId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    return res.json({
      message: "Upload video Cloudinary thành công",
      lesson: mapLesson(result.rows[0]),
      videoUrl: cloudinaryUrl,
      cloudinary: {
        public_id: uploadResult.public_id,
        duration: uploadResult.duration,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
      },
    });
  } catch (error: any) {
    console.error("uploadLessonVideo cloudinary error:", error);

    return res.status(500).json({
      message: "Upload video Cloudinary thất bại",
      error: error.message,
    });
  }
}

export async function uploadAssignment(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    if (!req.file) return res.status(400).json({ message: "Chưa chọn file bài tập" });

    const { title } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;

    const lessonResult = await db.query(
      `SELECT id, course_id FROM course_lessons WHERE id = $1`,
      [lessonId]
    );

    if (!lessonResult.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    const materialResult = await db.query(
      `
      INSERT INTO course_materials (
        id,
        course_id,
        lesson_id,
        file_name,
        file_url,
        file_type,
        file_size
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        newId(),
        lessonResult.rows[0].course_id,
        lessonId,
        title || req.file.originalname,
        fileUrl,
        req.file.mimetype,
        req.file.size,
      ]
    );

    const lessonUpdate = await db.query(
      `
      UPDATE course_lessons
      SET 
        lesson_type = CASE 
          WHEN lesson_type IN ('video', 'quiz') THEN lesson_type
          ELSE 'resource'
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [lessonId]
    );
    return res.json({
      message: "Upload bài tập thành công",
      material: materialResult.rows[0],
      lesson: mapLesson({
        ...lessonUpdate.rows[0],
        material_url: materialResult.rows[0].file_url,
      }),
    });
  } catch (error: any) {
    console.error("uploadAssignment error:", error);
    return res.status(500).json({
      message: "Upload bài tập thất bại",
      error: error.message,
    });
  }
}

export async function createLessonQuiz(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    const {
      title,
      pass_score,
      time_limit_minutes,
      max_attempts,
    } = req.body;

    const lessonResult = await db.query(
      `
      SELECT id, course_id
      FROM course_lessons
      WHERE id = $1
      `,
      [lessonId]
    );

    if (!lessonResult.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    const courseId = lessonResult.rows[0].course_id;

    const assessmentResult = await db.query(
      `
      INSERT INTO assessments (
        id,
        course_id,
        lesson_id,
        title,
        description,
        assessment_type,
        pass_score,
        time_limit_minutes,
        max_attempts,
        status
      )
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        'quiz',
        $5,
        $6,
        $7,
        'draft'
      )
      RETURNING *
      `,
      [
        courseId,
        lessonId,
        title || "Quiz bài học",
        `Quiz được tạo từ bài học ${lessonId}`,
        Number(pass_score) || 70,
        time_limit_minutes ? Number(time_limit_minutes) : null,
        Number(max_attempts) || 1,
      ]
    );

    const lessonUpdate = await db.query(
      `
      UPDATE course_lessons
      SET 
        lesson_type = 'quiz',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [lessonId]
    );

    return res.status(201).json({
      message: "Tạo quiz thành công",
      quiz: assessmentResult.rows[0],
      lesson: mapLesson({
        ...lessonUpdate.rows[0],
        quiz_id: assessmentResult.rows[0].id,
        quiz_title: assessmentResult.rows[0].title,
        quiz_pass_score: assessmentResult.rows[0].pass_score,
        quiz_time_limit_minutes: assessmentResult.rows[0].time_limit_minutes,
        quiz_max_attempts: assessmentResult.rows[0].max_attempts,
      }),
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Tạo quiz thất bại",
      error: error.message,
    });
  }
}

export async function attachLibraryResource(req: Request, res: Response) {
  try {
    const lessonId = String(req.params.lessonId);
    if (!isUUID(lessonId)) return badUuid(res, "lessonId", lessonId);

    const { library_resource_id, content_url, file_name, file_type } = req.body;

    if (!content_url && !library_resource_id) {
      return res.status(400).json({ message: "Thiếu tài nguyên cần gắn" });
    }

    const lessonResult = await db.query(
      `SELECT id, course_id FROM course_lessons WHERE id = $1`,
      [lessonId]
    );

    if (!lessonResult.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy bài học" });
    }

    const materialResult = await db.query(
      `
      INSERT INTO course_materials (
        id,
        course_id,
        lesson_id,
        file_name,
        file_url,
        file_type,
        file_size
      )
      VALUES ($1,$2,$3,$4,$5,$6,NULL)
      RETURNING *
      `,
      [
        newId(),
        lessonResult.rows[0].course_id,
        lessonId,
        file_name || library_resource_id || "Tài nguyên bài học",
        content_url || library_resource_id,
        file_type || "resource",
      ]
    );

    const lessonUpdate = await db.query(
      `
      UPDATE course_lessons
      SET 
        lesson_type = CASE 
          WHEN lesson_type IN ('video', 'quiz') THEN lesson_type
          ELSE 'resource'
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [lessonId]
    );
    return res.json({
      message: "Gắn tài nguyên thành công",
      material: materialResult.rows[0],
      lesson: mapLesson({
        ...lessonUpdate.rows[0],
        material_url: materialResult.rows[0].file_url,
        library_resource_id: materialResult.rows[0].id,
      }),
    });
  } catch (error: any) {
    console.error("attachLibraryResource error:", error);
    return res.status(500).json({
      message: "Gắn tài nguyên thất bại",
      error: error.message,
    });
  }
}

export async function updateSection(req: Request, res: Response) {
  try {
    const sectionId = String(req.params.sectionId);
    if (!isUUID(sectionId)) return badUuid(res, "sectionId", sectionId);

    const { title, sort_order } = req.body;

    const result = await db.query(
      `
      UPDATE course_sections
      SET
        title = COALESCE($1, title),
        sort_order = COALESCE($2, sort_order),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [title || null, sort_order ?? null, sectionId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy section" });
    }

    return res.json({ section: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({
      message: "Cập nhật section thất bại",
      error: error.message,
    });
  }
}

export async function deleteSection(req: Request, res: Response) {
  try {
    const sectionId = String(req.params.sectionId);
    if (!isUUID(sectionId)) return badUuid(res, "sectionId", sectionId);

    const result = await db.query(
      `
      DELETE FROM course_sections
      WHERE id = $1
      RETURNING *
      `,
      [sectionId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy section" });
    }

    return res.json({ message: "Đã xóa section" });
  } catch (error: any) {
    return res.status(500).json({
      message: "Xóa section thất bại",
      error: error.message,
    });
  }
}

export async function getLearningTargets(_req: Request, res: Response) {
  try {
    let departments: any[] = [];
    let employees: any[] = [];

    const departmentQueries = [
      `
      SELECT id, name
      FROM departments
      ORDER BY name ASC
      `,
      `
      SELECT id, name
      FROM department
      ORDER BY name ASC
      `,
      `
      SELECT id, department_name AS name
      FROM departments
      ORDER BY department_name ASC
      `,
    ];

    for (const sql of departmentQueries) {
      try {
        const result = await db.query(sql);
        departments = result.rows.map((row: any) => ({
          id: row.id,
          name: row.name || row.department_name || "Phòng ban",
        }));
        break;
      } catch {
        departments = [];
      }
    }

    const employeeQueries = [
      `
      SELECT id, full_name, email, department_id
      FROM employees
      ORDER BY full_name ASC
      `,
      `
      SELECT id, name AS full_name, email, department_id
      FROM employees
      ORDER BY name ASC
      `,
      `
      SELECT id, full_name, email, department_id
      FROM users
      ORDER BY full_name ASC
      `,
      `
      SELECT id, name AS full_name, email, department_id
      FROM users
      ORDER BY name ASC
      `,
      `
      SELECT id, username AS full_name, email, NULL::uuid AS department_id
      FROM users
      ORDER BY username ASC
      `,
      `
      SELECT id, full_name, email, NULL::uuid AS department_id
      FROM staff
      ORDER BY full_name ASC
      `,
    ];

    for (const sql of employeeQueries) {
      try {
        const result = await db.query(sql);
        employees = result.rows.map((row: any) => ({
          id: row.id,
          name: row.full_name || row.name || row.username || row.email || "Nhân viên",
          full_name: row.full_name || row.name || row.username || row.email || "Nhân viên",
          email: row.email || null,
          department_id: row.department_id || null,
        }));
        break;
      } catch {
        employees = [];
      }
    }

    return res.json({
      departments,
      employees,
    });
  } catch (error: any) {
    console.error("getLearningTargets error:", error);
    return res.status(500).json({
      message: "Không lấy được đối tượng học",
      error: error.message,
    });
  }
}

export async function getCourseStats(_req: Request, res: Response) {
  try {
    const totalCourses = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM courses
    `);

    const activeLearners = await db.query(`
      SELECT COUNT(DISTINCT user_id)::int AS total
      FROM course_registrations
      WHERE status IN ('registered', 'in_progress', 'assigned')
    `);

    const pendingCourses = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM courses
      WHERE status IN ('draft', 'review')
    `);

    return res.json({
      totalCourses: totalCourses.rows[0]?.total || 0,
      activeLearners: activeLearners.rows[0]?.total || 0,
      completionRate: 0,
      pendingCourses: pendingCourses.rows[0]?.total || 0,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Không lấy được thống kê khóa học",
      error: error.message,
    });
  }
}