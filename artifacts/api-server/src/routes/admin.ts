import { Router, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, leadsTable, contactsTable, activitiesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { badRequest, notFound } from "../lib/errors";

const router = Router();

router.get("/admin/users", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    }).from(usersTable).orderBy(sql`${usersTable.createdAt} desc`);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.post("/admin/users", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, firstName, lastName, role } = req.body;

    if (!email) throw badRequest("Email is required");
    if (role && !["admin", "user"].includes(role)) throw badRequest("Role must be 'admin' or 'user'");

    const trimmedEmail = email.trim().toLowerCase();
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, trimmedEmail));
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const [user] = await db.insert(usersTable).values({
      email: trimmedEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      role: role || "user",
      isActive: true,
    }).returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/admin/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, isActive } = req.body;
    if (role !== undefined && !["admin", "user"].includes(role)) throw badRequest("Role must be 'admin' or 'user'");

    const updates: Record<string, string | boolean> = {};
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) throw badRequest("No fields to update");

    if (req.params.id === req.user!.id && isActive === false) throw badRequest("You cannot disable your own account");
    if (req.params.id === req.user!.id && role && role !== "admin") throw badRequest("You cannot remove your own admin role");

    const [updated] = await db.update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.params.id))
      .returning();

    if (!updated) throw notFound("User not found");

    res.json({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) throw badRequest("You cannot delete your own account");

    const [deleted] = await db.delete(usersTable)
      .where(eq(usersTable.id, req.params.id))
      .returning();

    if (!deleted) throw notFound("User not found");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/export/:type", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.params;
    const format = (req.query.format as string) || "json";

    let data: Record<string, unknown>[];
    switch (type) {
      case "leads":
        data = await db.select().from(leadsTable);
        break;
      case "contacts":
        data = await db.select().from(contactsTable);
        break;
      case "activities":
        data = await db.select().from(activitiesTable);
        break;
      default:
        throw badRequest("Invalid export type. Must be leads, contacts, or activities.");
    }

    if (format === "csv") {
      if (data.length === 0) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);
        res.send("");
        return;
      }

      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(","),
        ...data.map((row: Record<string, unknown>) =>
          headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(",")
        ),
      ];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);
      res.send(csvRows.join("\n"));
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${type}.json"`);
      res.json(data);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/admin/import/:type", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.params;
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      throw badRequest("Data must be a non-empty array");
    }

    let imported = 0;
    switch (type) {
      case "leads":
        for (const row of data) {
          await db.insert(leadsTable).values({
            name: row.name || "Unnamed",
            email: row.email || "",
            company: row.company || null,
            title: row.title || null,
            phone: row.phone || null,
            status: row.status || "new",
            source: row.source || null,
            notes: row.notes || null,
            isBeta: row.isBeta === true,
            userId: req.user!.id,
          });
          imported++;
        }
        break;
      case "contacts":
        for (const row of data) {
          await db.insert(contactsTable).values({
            name: row.name || "Unnamed",
            email: row.email || null,
            phone: row.phone || null,
            company: row.company || null,
            title: row.title || null,
            relationshipType: row.relationshipType || "other",
            priority: row.priority || "medium",
            notes: row.notes || null,
            linkedinUrl: row.linkedinUrl || null,
            userId: req.user!.id,
          });
          imported++;
        }
        break;
      default:
        throw badRequest("Invalid import type. Must be leads or contacts.");
    }

    res.json({ imported });
  } catch (err) {
    next(err);
  }
});

export default router;
