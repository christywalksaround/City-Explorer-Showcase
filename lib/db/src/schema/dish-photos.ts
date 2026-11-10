import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Photo bytes are stored as base64 in PostgreSQL, as requested.
export const dishPhotosTable = pgTable("dish_photos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  caption: text("caption"),
  mimeType: text("mime_type").notNull(),
  imageBase64: text("image_base64").notNull(),
  inspectorNote: text("inspector_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDishPhotoSchema = createInsertSchema(dishPhotosTable).omit({
  id: true, createdAt: true,
});
export type DishPhoto = typeof dishPhotosTable.$inferSelect;
export type InsertDishPhoto = typeof dishPhotosTable.$inferInsert;
