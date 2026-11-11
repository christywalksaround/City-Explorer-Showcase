import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, dishPhotosTable } from "@workspace/db";
import { CreateDishBody, CreateDishResponse, ListDishesResponse, GetDishImageParams } from "@workspace/api-zod";
import { CITY_DISH, inspectDish, inspectionFailure, inspectorNote, isApproved } from "../agents/dishInspector";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// Select metadata only: gallery requests never load the large base64 column.
const metadata = {
  id: dishPhotosTable.id,
  title: dishPhotosTable.title,
  caption: dishPhotosTable.caption,
  mimeType: dishPhotosTable.mimeType,
  inspectorNote: dishPhotosTable.inspectorNote,
  createdAt: dishPhotosTable.createdAt,
};
function withImageUrl<T extends { id: number; createdAt: Date }>(item: T) {
  return { ...item, createdAt: item.createdAt.toISOString(), imageUrl: `/api/dishes/${item.id}/image` };
}

router.get("/dishes", async (_req, res): Promise<void> => {
  const photos = await db.select(metadata).from(dishPhotosTable)
    .orderBy(desc(dishPhotosTable.createdAt), desc(dishPhotosTable.id));
  res.json(ListDishesResponse.parse(photos.map(withImageUrl)));
});

router.post("/dishes", async (req, res): Promise<void> => {
  const parsed = CreateDishBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.title.trim()) {
    res.status(400).json({ error: "Enter a title (up to 120 characters), an optional caption (up to 1,000 characters), and a photo." });
    return;
  }

  // Check both the declared type and decoded bytes; renaming a GIF is not enough.
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.data.image);
  if (!match) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP photo." });
    return;
  }
  const [, mimeType, imageBase64] = match;
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Photo is too large. Choose a photo up to 3 MB." });
    return;
  }
  if (!bytes.length || bytes.toString("base64") !== imageBase64) {
    res.status(400).json({ error: "Invalid image data. Choose another photo." });
    return;
  }
  try {
    // Bound decoded size as well to avoid tiny compressed image bombs.
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const info = await image.metadata();
    if (`image/${info.format}` !== mimeType) throw new Error("Image type mismatch");
    await image.stats(); // Decode the full image to reject corrupt uploads before saving.
  } catch {
    res.status(400).json({ error: "This photo is invalid or too large to decode. Choose a valid JPEG, PNG, or WebP." });
    return;
  }
  let inspection;
  try {
    inspection = await inspectDish(`data:${mimeType};base64,${imageBase64}`);
  } catch (error) {
    // Fail closed: never save an uninspected image, even during an AI outage.
    // Do not log provider errors that could contain image data or credentials.
    const { category } = inspectionFailure(error);
    req.log.warn({ category }, "Dish inspector failed; photo not saved");
    const message = category === "rate_limit"
      ? "The photo inspector is busy right now. Your photo was not saved. Please wait a minute and try again."
      : category === "configuration" || category === "model"
        ? "The photo inspector needs a configuration update. Your photo was not saved. Please contact the site owner."
        : "The photo inspector could not finish checking your photo. Your photo was not saved. Please try again shortly.";
    res.status(502).json({ error: message });
    return;
  }
  if (!isApproved(inspection)) {
    res.status(422).json({
      error: `Only ${CITY_DISH} photos can be uploaded!`,
      reason: `The inspector saw: ${inspection.whatISee}`,
    });
    return;
  }
  const [saved] = await db.insert(dishPhotosTable).values({
    title: parsed.data.title.trim(),
    caption: parsed.data.caption?.trim() || "",
    mimeType, imageBase64,
    inspectorNote: inspectorNote(inspection),
  }).returning(metadata);
  res.status(201).json(CreateDishResponse.parse(withImageUrl(saved)));
});

router.get("/dishes/:id/image", async (req, res): Promise<void> => {
  const params = GetDishImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Photo not found." });
    return;
  }
  const [photo] = await db.select({
    mimeType: dishPhotosTable.mimeType, imageBase64: dishPhotosTable.imageBase64,
  }).from(dishPhotosTable).where(eq(dishPhotosTable.id, params.data.id));
  if (!photo) {
    res.status(404).json({ error: "Photo not found." });
    return;
  }
  res.set("Content-Type", photo.mimeType);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(Buffer.from(photo.imageBase64, "base64"));
});

export default router;
