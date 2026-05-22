import "dotenv/config";

import express, { Request, Response } from "express";
import cors from "cors";

import { testDatabaseConnection } from "./config/db";

import authRoutes from "./routes/auth.routes";
import usersRoutes from "./routes/users.routes";
import departmentsRoutes from "./routes/departments.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import auditRoutes from "./routes/audit.routes";
import coursesRoutes from "./routes/courses.routes";
import lessonsRoutes from "./routes/lessons.routes";
import enrollmentsRoutes from "./routes/enrollments.routes";
import rolesRoutes from "./routes/roles.routes";
import progressRoutes from "./routes/progress.routes";
import myLearningRoutes from "./routes/myLearning.routes";
import quizzesRoutes from "./routes/quizzes.routes";
import lmsDashboardRoutes from "./routes/lmsDashboard.routes";
import courseRegistrationsRoutes from "./routes/courseRegistrations.routes";
import subscriptionsRoutes from "./routes/subscriptions.routes";
import storageRoutes from "./routes/storage.routes";
import courseCategoriesRoutes from "./routes/courseCategories.routes";
import courseBuilderRoutes from "./routes/courseBuilder.routes";
import assessmentsRoutes from "./routes/assessments.routes";
import questionBanksRoutes from "./routes/questionBanks.routes";
import liveClassesRoutes from "./routes/liveClasses.routes";
import learningPathsRoutes from "./routes/learningPaths.routes";
import instructorsRoutes from "./routes/instructors.routes";
import badgesRoutes from "./routes/badges.routes";
import reportsRoutes from "./routes/reports.routes";
import rankingsRoutes from "./routes/rankings.routes";
import studyTimeReportRoutes from "./routes/studyTimeReport.routes";
import courseCompletionReportRoutes from "./routes/courseCompletionReport.routes";
import trainingCostsRoutes from "./routes/trainingCosts.routes";
import employeeDevelopmentPathRoutes from "./routes/employeeDevelopmentPath.routes";
import employeeStudyPlanRoutes from "./routes/employeeStudyPlan.routes";
import employeeTrainingScheduleRoutes from "./routes/employeeTrainingSchedule.routes";
import employeeCourseLearningRoutes from "./routes/employeeCourseLearning.routes";
import employeeLearningPathRoutes from "./routes/employeeLearningPath.routes";
import entranceTestRoutes from "./routes/entranceTest.routes";

const app = express();

const PORT = Number(process.env.PORT || 5000);

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/", (req: Request, res: Response) => {
  return res.json({
    success: true,
    message: "BELMS Backend Running",
  });
});

app.get("/api/health", async (req: Request, res: Response) => {
  const dbConnected = await testDatabaseConnection();

  return res.json({
    success: true,
    server: "running",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/audit-logs", auditRoutes);

app.use("/api/courses", coursesRoutes);
app.use("/api", lessonsRoutes);
app.use("/api/enrollments", enrollmentsRoutes);
app.use("/api", progressRoutes);
app.use("/api/my-learning", myLearningRoutes);
app.use("/api", quizzesRoutes);

app.use("/api/lms-dashboard", lmsDashboardRoutes);
app.use("/api/course-registrations", courseRegistrationsRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/course-categories", courseCategoriesRoutes);
app.use("/api/builder", courseBuilderRoutes);
app.use("/api/assessments", assessmentsRoutes);
app.use("/api/question-banks", questionBanksRoutes);

app.use("/uploads", express.static("uploads"));
app.use("/api/live-classes", liveClassesRoutes);
app.use("/api/learning-paths", learningPathsRoutes);
app.use("/api/instructors", instructorsRoutes);
app.use("/api/badges", badgesRoutes);
app.use("/api/lms-admin/reports", reportsRoutes);
app.use("/api/reports/rankings", rankingsRoutes);
app.use("/api/study-time-report", studyTimeReportRoutes);
app.use("/api/reports/completions", courseCompletionReportRoutes);
app.use("/api/reports/costs", trainingCostsRoutes);

app.use("/api/employee/development-path", employeeDevelopmentPathRoutes);
app.use("/api/employee/study-plan", employeeStudyPlanRoutes);
app.use("/api/employee/training-schedule", employeeTrainingScheduleRoutes);
app.use("/api/employee-learning", employeeCourseLearningRoutes);
app.use("/api/employee/learning-path", employeeLearningPathRoutes);

app.use("/api/entrance-test", entranceTestRoutes);

app.use((req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: "API không tồn tại",
    path: req.originalUrl,
  });
});

async function startServer() {
  try {
    const isDbConnected = await testDatabaseConnection();

    if (!isDbConnected) {
      console.error(
        "Không thể kết nối database. Vui lòng kiểm tra DATABASE_URL trong file .env."
      );
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("Lỗi khởi động server:", error);
    process.exit(1);
  }
}

startServer();