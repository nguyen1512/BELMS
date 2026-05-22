import { db } from "../config/db";

type AuditLogInput = {
  userId?: string | null | undefined;
  action: string;
  module: string;
  targetId?: string | null | undefined;
  targetType?: string | null | undefined;
  description?: string | null | undefined;
};

export async function createAuditLog(input: AuditLogInput) {
  try {
    await db.query(
      `
      INSERT INTO audit_logs (
        user_id,
        action,
        module,
        target_id,
        target_type,
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.userId || null,
        input.action,
        input.module,
        input.targetId || null,
        input.targetType || null,
        input.description || null,
      ]
    );
  } catch (error) {
    console.error("Create audit log error:", error);
  }
}