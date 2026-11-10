---
name: Dish photo storage
description: Why the gallery stores image data in the database.
---
Keep dish photos in the database as base64 unless the user approves changing this requirement.

**Why:** The user explicitly requested a dish_photos table with image_base64 and persistence across server restarts.

**How to apply:** Do not automatically migrate this gallery to App Storage when applying general upload guidance. Reject original files above 3 MB before browser resizing; the user explicitly expects a 10 MB upload to fail.

Browser file pickers can supply valid photos with an empty or generic MIME type.

**Why:** Browser verification supplied JPEG and PNG files as application/octet-stream, which made strict MIME-only validation reject real photos.

**How to apply:** For unknown MIME types, use the extension only as an initial hint, then verify actual image bytes before resizing. Keep server-side format and decode validation.
