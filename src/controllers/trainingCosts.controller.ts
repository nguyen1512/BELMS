import { Request, Response } from "express";
import { db } from "../config/db";

const parseNumber = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatPeriod = (period?: string) => {
  const now = new Date();
  const year = now.getFullYear();

  if (period === "last_year") {
    return {
      startDate: `${year - 1}-01-01`,
      endDate: `${year - 1}-12-31`,
    };
  }

  if (period === "this_month") {
    const month = String(now.getMonth() + 1).padStart(2, "0");

    return {
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-31`,
    };
  }

  if (period === "this_quarter") {
    const currentMonth = now.getMonth() + 1;
    const quarterStartMonth = Math.floor((currentMonth - 1) / 3) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;

    return {
      startDate: `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`,
      endDate: `${year}-${String(quarterEndMonth).padStart(2, "0")}-31`,
    };
  }

  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

const buildFilters = (query: Request["query"]) => {
  const values: any[] = [];
  const conditions: string[] = [];

  const { keyword, period, departmentId, status } = query;

  const dateRange = formatPeriod(period as string);

  values.push(dateRange.startDate);
  conditions.push(`tc.cost_date >= $${values.length}`);

  values.push(dateRange.endDate);
  conditions.push(`tc.cost_date <= $${values.length}`);

  if (keyword) {
    values.push(`%${keyword}%`);
    conditions.push(`
      (
        COALESCE(d.name, '') ILIKE $${values.length}
        OR COALESCE(c.title, '') ILIKE $${values.length}
        OR COALESCE(tc.note, '') ILIKE $${values.length}
      )
    `);
  }

  if (departmentId && departmentId !== "all") {
    values.push(departmentId);
    conditions.push(`tc.department_id = $${values.length}`);
  }

  if (status && status !== "all") {
    values.push(status);
    conditions.push(`tc.status = $${values.length}`);
  }

  return {
    values,
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
  };
};

const buildCourseRoi = (completionRate: number, costPerLearner: number) => {
  if (completionRate >= 75 && costPerLearner <= 500000) {
    return "Cao";
  }

  if (completionRate < 50) {
    return "Thấp";
  }

  return "Trung bình";
};

export const getTrainingCostSummary = async (req: Request, res: Response) => {
  try {
    const { values, whereClause } = buildFilters(req.query);

    const result = await db.query(
      `
      SELECT
        COALESCE(SUM(tc.budget_amount), 0) AS total_budget,
        COALESCE(SUM(tc.used_amount), 0) AS total_used,
        COALESCE(SUM(tc.learner_count), 0) AS total_learners,
        COALESCE(AVG(tc.completion_rate), 0) AS avg_completion_rate
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      `,
      values
    );

    const row = result.rows[0];

    const totalBudget = parseNumber(row.total_budget);
    const totalUsed = parseNumber(row.total_used);
    const totalLearners = parseNumber(row.total_learners);
    const avgCompletionRate = parseNumber(row.avg_completion_rate);

    res.json({
      success: true,
      data: {
        totalBudget,
        totalUsed,
        costPerLearner:
          totalLearners > 0 ? Math.round(totalUsed / totalLearners) : 0,
        completionEfficiency: Math.round(avgCompletionRate),
      },
    });
  } catch (error) {
    console.error("getTrainingCostSummary error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu tổng quan chi phí đào tạo",
    });
  }
};

export const getTrainingCostDepartments = async (
  req: Request,
  res: Response
) => {
  try {
    const { values, whereClause } = buildFilters(req.query);

    const result = await db.query(
      `
      SELECT
        d.id AS department_id,
        COALESCE(d.name, 'Chưa xác định') AS department_name,
        COALESCE(SUM(tc.budget_amount), 0) AS budget_amount,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount,
        COALESCE(SUM(tc.learner_count), 0) AS learner_count,
        COALESCE(AVG(tc.completion_rate), 0) AS completion_rate,
        COALESCE(MAX(tc.status), 'stable') AS status
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY d.id, d.name
      ORDER BY used_amount DESC
      `,
      values
    );

    const data = result.rows.map((row) => {
      const budgetAmount = parseNumber(row.budget_amount);
      const usedAmount = parseNumber(row.used_amount);
      const learnerCount = parseNumber(row.learner_count);

      return {
        departmentId: row.department_id,
        departmentName: row.department_name,
        budgetAmount,
        usedAmount,
        learnerCount,
        costPerLearner:
          learnerCount > 0 ? Math.round(usedAmount / learnerCount) : 0,
        budgetUsageRate:
          budgetAmount > 0 ? Math.round((usedAmount / budgetAmount) * 100) : 0,
        completionRate: Math.round(parseNumber(row.completion_rate)),
        status: row.status || "stable",
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getTrainingCostDepartments error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu chi phí theo phòng ban",
    });
  }
};

export const getTrainingCostMonthlyTrend = async (
  req: Request,
  res: Response
) => {
  try {
    const { values, whereClause } = buildFilters(req.query);

    const result = await db.query(
      `
      SELECT
        EXTRACT(MONTH FROM tc.cost_date)::INT AS month_number,
        CONCAT('T', EXTRACT(MONTH FROM tc.cost_date)::INT) AS month_label,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY month_number
      ORDER BY month_number ASC
      `,
      values
    );

    const data = result.rows.map((row) => ({
      month: row.month_label,
      monthNumber: parseNumber(row.month_number),
      value: parseNumber(row.used_amount),
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getTrainingCostMonthlyTrend error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy xu hướng chi phí theo tháng",
    });
  }
};

export const getTrainingCostCourseCosts = async (
  req: Request,
  res: Response
) => {
  try {
    const { values, whereClause } = buildFilters(req.query);

    const result = await db.query(
      `
      SELECT
        c.id AS course_id,
        COALESCE(c.title, 'Chưa xác định') AS course_name,
        'Nội bộ' AS course_type,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount,
        COALESCE(SUM(tc.learner_count), 0) AS learner_count,
        COALESCE(AVG(tc.completion_rate), 0) AS completion_rate
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY c.id, c.title
      ORDER BY used_amount DESC
      `,
      values
    );

    const data = result.rows.map((row) => {
      const usedAmount = parseNumber(row.used_amount);
      const learnerCount = parseNumber(row.learner_count);
      const costPerLearner =
        learnerCount > 0 ? Math.round(usedAmount / learnerCount) : 0;
      const completionRate = Math.round(parseNumber(row.completion_rate));

      return {
        courseId: row.course_id,
        courseName: row.course_name,
        courseType: row.course_type,
        usedAmount,
        learnerCount,
        costPerLearner,
        completionRate,
        roi: buildCourseRoi(completionRate, costPerLearner),
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("getTrainingCostCourseCosts error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu chi phí theo khóa học",
    });
  }
};

export const getTrainingCostReport = async (req: Request, res: Response) => {
  try {
    const { values, whereClause } = buildFilters(req.query);

    const summaryResult = await db.query(
      `
      SELECT
        COALESCE(SUM(tc.budget_amount), 0) AS total_budget,
        COALESCE(SUM(tc.used_amount), 0) AS total_used,
        COALESCE(SUM(tc.learner_count), 0) AS total_learners,
        COALESCE(AVG(tc.completion_rate), 0) AS avg_completion_rate
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      `,
      values
    );

    const departmentsResult = await db.query(
      `
      SELECT
        d.id AS department_id,
        COALESCE(d.name, 'Chưa xác định') AS department_name,
        COALESCE(SUM(tc.budget_amount), 0) AS budget_amount,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount,
        COALESCE(SUM(tc.learner_count), 0) AS learner_count,
        COALESCE(AVG(tc.completion_rate), 0) AS completion_rate,
        COALESCE(MAX(tc.status), 'stable') AS status
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY d.id, d.name
      ORDER BY used_amount DESC
      `,
      values
    );

    const monthlyResult = await db.query(
      `
      SELECT
        EXTRACT(MONTH FROM tc.cost_date)::INT AS month_number,
        CONCAT('T', EXTRACT(MONTH FROM tc.cost_date)::INT) AS month_label,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY month_number
      ORDER BY month_number ASC
      `,
      values
    );

    const courseCostsResult = await db.query(
      `
      SELECT
        c.id AS course_id,
        COALESCE(c.title, 'Chưa xác định') AS course_name,
        'Nội bộ' AS course_type,
        COALESCE(SUM(tc.used_amount), 0) AS used_amount,
        COALESCE(SUM(tc.learner_count), 0) AS learner_count,
        COALESCE(AVG(tc.completion_rate), 0) AS completion_rate
      FROM training_costs tc
      LEFT JOIN departments d ON d.id = tc.department_id
      LEFT JOIN courses c ON c.id = tc.course_id
      ${whereClause}
      GROUP BY c.id, c.title
      ORDER BY used_amount DESC
      `,
      values
    );

    const summaryRow = summaryResult.rows[0];

    const totalBudget = parseNumber(summaryRow.total_budget);
    const totalUsed = parseNumber(summaryRow.total_used);
    const totalLearners = parseNumber(summaryRow.total_learners);
    const avgCompletionRate = parseNumber(summaryRow.avg_completion_rate);

    const departments = departmentsResult.rows.map((row) => {
      const budgetAmount = parseNumber(row.budget_amount);
      const usedAmount = parseNumber(row.used_amount);
      const learnerCount = parseNumber(row.learner_count);

      return {
        departmentId: row.department_id,
        departmentName: row.department_name,
        budgetAmount,
        usedAmount,
        learnerCount,
        costPerLearner:
          learnerCount > 0 ? Math.round(usedAmount / learnerCount) : 0,
        budgetUsageRate:
          budgetAmount > 0 ? Math.round((usedAmount / budgetAmount) * 100) : 0,
        completionRate: Math.round(parseNumber(row.completion_rate)),
        status: row.status || "stable",
      };
    });

    const monthlyTrend = monthlyResult.rows.map((row) => ({
      month: row.month_label,
      monthNumber: parseNumber(row.month_number),
      value: parseNumber(row.used_amount),
    }));

    const courseCosts = courseCostsResult.rows.map((row) => {
      const usedAmount = parseNumber(row.used_amount);
      const learnerCount = parseNumber(row.learner_count);
      const costPerLearner =
        learnerCount > 0 ? Math.round(usedAmount / learnerCount) : 0;
      const completionRate = Math.round(parseNumber(row.completion_rate));

      return {
        courseId: row.course_id,
        courseName: row.course_name,
        courseType: row.course_type,
        usedAmount,
        learnerCount,
        costPerLearner,
        completionRate,
        roi: buildCourseRoi(completionRate, costPerLearner),
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalBudget,
          totalUsed,
          costPerLearner:
            totalLearners > 0 ? Math.round(totalUsed / totalLearners) : 0,
          completionEfficiency: Math.round(avgCompletionRate),
        },
        departments,
        monthlyTrend,
        courseCosts,
      },
    });
  } catch (error) {
    console.error("getTrainingCostReport error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy báo cáo chi phí đào tạo",
    });
  }
};