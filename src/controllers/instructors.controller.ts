import { Request, Response } from "express";
import { db } from "../config/db";

export const getInstructorStats = async (req: Request, res: Response) => {
  try {
    const totalInstructorsQuery = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM instructors
      WHERE deleted_at IS NULL
    `);

    const totalAssignedCoursesQuery = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM course_instructors
      WHERE deleted_at IS NULL
    `);

    const avgRatingQuery = await db.query(`
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS avg_rating
      FROM instructors
      WHERE deleted_at IS NULL
    `);

    const specialtiesQuery = await db.query(`
      SELECT COUNT(DISTINCT COALESCE(NULLIF(specialty, ''), NULLIF(expertise, '')))::int AS total
      FROM instructors
      WHERE deleted_at IS NULL
        AND COALESCE(NULLIF(specialty, ''), NULLIF(expertise, '')) IS NOT NULL
    `);

    return res.status(200).json({
      success: true,
      data: {
        totalInstructors: totalInstructorsQuery.rows[0]?.total || 0,
        totalAssignedCourses: totalAssignedCoursesQuery.rows[0]?.total || 0,
        averageRating: Number(avgRatingQuery.rows[0]?.avg_rating || 0),
        totalSpecialties: specialtiesQuery.rows[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("GET INSTRUCTOR STATS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê giảng viên",
    });
  }
};

export const getInstructors = async (req: Request, res: Response) => {
  try {
    const { search, specialty, status } = req.query;

    const conditions: string[] = ["i.deleted_at IS NULL"];
    const values: any[] = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`
        (
          i.full_name ILIKE $${values.length}
          OR i.name ILIKE $${values.length}
          OR i.email ILIKE $${values.length}
          OR i.phone ILIKE $${values.length}
          OR i.position ILIKE $${values.length}
          OR i.expertise ILIKE $${values.length}
          OR i.specialty ILIKE $${values.length}
          OR i.bio ILIKE $${values.length}
          OR i.description ILIKE $${values.length}
        )
      `);
    }

    if (specialty && specialty !== "all") {
      values.push(String(specialty));
      conditions.push(`
        (
          i.specialty = $${values.length}
          OR i.expertise = $${values.length}
        )
      `);
    }

    if (status && status !== "all") {
      values.push(String(status));
      conditions.push(`i.status = $${values.length}`);
    }

    const result = await db.query(
      `
      SELECT 
        i.id,
        i.user_id,
        COALESCE(i.full_name, i.name) AS name,
        i.full_name,
        i.email,
        i.phone,
        i.position,
        COALESCE(i.specialty, i.expertise) AS specialty,
        i.expertise,
        COALESCE(i.description, i.bio) AS description,
        i.bio,
        COALESCE(i.rating, 0) AS rating,
        COALESCE(i.status, 'active') AS status,
        i.created_at,
        i.updated_at,
        COUNT(ci.id)::int AS assigned_courses
      FROM instructors i
      LEFT JOIN course_instructors ci 
        ON ci.instructor_id = i.id 
        AND ci.deleted_at IS NULL
      WHERE ${conditions.join(" AND ")}
      GROUP BY i.id
      ORDER BY i.created_at DESC
      `,
      values
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET INSTRUCTORS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách giảng viên",
    });
  }
};

export const createInstructor = async (req: Request, res: Response) => {
  try {
    const {
      name,
      full_name,
      email,
      phone,
      position,
      specialty,
      expertise,
      description,
      bio,
      status,
    } = req.body;

    const instructorName = full_name || name;
    const instructorSpecialty = specialty || expertise;
    const instructorDescription = description || bio;

    if (!instructorName || !position || !instructorSpecialty) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ tên giảng viên, chức danh và chuyên môn",
      });
    }

    const result = await db.query(
      `
      INSERT INTO instructors (
        full_name,
        name,
        email,
        phone,
        position,
        expertise,
        specialty,
        bio,
        description,
        rating,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, NOW(), NOW()
      )
      RETURNING
        id,
        user_id,
        COALESCE(full_name, name) AS name,
        full_name,
        email,
        phone,
        position,
        COALESCE(specialty, expertise) AS specialty,
        expertise,
        COALESCE(description, bio) AS description,
        bio,
        rating,
        status,
        created_at,
        updated_at
      `,
      [
        instructorName,
        instructorName,
        email || null,
        phone || null,
        position,
        instructorSpecialty,
        instructorSpecialty,
        instructorDescription || null,
        instructorDescription || null,
        0,
        status || "active",
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Thêm giảng viên thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE INSTRUCTOR ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi thêm giảng viên",
    });
  }
};

export const assignInstructorToCourse = async (req: Request, res: Response) => {
  try {
    const {
      instructor_id,
      instructorId,
      course_id,
      courseId,
      start_date,
      startDate,
      role_in_course,
      roleInCourse,
    } = req.body;

    const finalInstructorId = instructor_id || instructorId;
    const finalCourseId = course_id || courseId;
    const finalStartDate = start_date || startDate || null;
    const finalRoleInCourse =
      role_in_course || roleInCourse || "Giảng viên phụ trách";

    if (!finalInstructorId || !finalCourseId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng chọn giảng viên và khóa học cần gán",
      });
    }

    const instructorCheck = await db.query(
      `
      SELECT id 
      FROM instructors
      WHERE id = $1 
        AND deleted_at IS NULL
      `,
      [finalInstructorId]
    );

    if (instructorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giảng viên",
      });
    }

    const courseCheck = await db.query(
      `
      SELECT id
      FROM courses
      WHERE id = $1
      `,
      [finalCourseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy khóa học",
      });
    }

    const existed = await db.query(
      `
      SELECT id 
      FROM course_instructors
      WHERE instructor_id = $1
        AND course_id = $2
        AND deleted_at IS NULL
      `,
      [finalInstructorId, finalCourseId]
    );

    if (existed.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Giảng viên này đã được gán vào khóa học đã chọn",
      });
    }

    const result = await db.query(
      `
      INSERT INTO course_instructors (
        instructor_id,
        course_id,
        start_date,
        role_in_course,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
      `,
      [
        finalInstructorId,
        finalCourseId,
        finalStartDate,
        finalRoleInCourse,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Gán giảng viên vào khóa học thành công",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("ASSIGN INSTRUCTOR ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi gán giảng viên vào khóa học",
    });
  }
};

export const getInstructorCourses = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      SELECT
        ci.id,
        ci.instructor_id,
        ci.course_id,
        ci.start_date,
        ci.role_in_course,
        ci.created_at,
        c.title AS course_title,
        c.description AS course_description,
        c.status AS course_status
      FROM course_instructors ci
      JOIN courses c ON c.id = ci.course_id
      WHERE ci.instructor_id = $1
        AND ci.deleted_at IS NULL
      ORDER BY ci.created_at DESC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET INSTRUCTOR COURSES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy khóa học của giảng viên",
    });
  }
};

export const deleteInstructor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
      UPDATE instructors
      SET 
        deleted_at = NOW(),
        updated_at = NOW(),
        status = 'inactive'
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy giảng viên cần xóa",
      });
    }

    await db.query(
      `
      UPDATE course_instructors
      SET 
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE instructor_id = $1
        AND deleted_at IS NULL
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Xóa giảng viên thành công",
    });
  } catch (error) {
    console.error("DELETE INSTRUCTOR ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi xóa giảng viên",
    });
  }
};

export const getCourseOptionsForInstructor = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM courses
      ORDER BY created_at DESC
    `);

    const courses = result.rows.map((course: any) => ({
      id: course.id,
      title:
        course.title ||
        course.name ||
        course.course_name ||
        course.course_title ||
        "Khóa học chưa có tên",
      description: course.description || null,
      status: course.status || null,
      raw: course,
    }));

    return res.status(200).json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error("GET COURSE OPTIONS FOR INSTRUCTOR ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách khóa học",
    });
  }
};