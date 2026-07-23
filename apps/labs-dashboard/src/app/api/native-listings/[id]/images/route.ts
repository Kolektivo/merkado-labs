import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import {
  MAX_NATIVE_IMAGE_BYTES,
  MAX_NATIVE_IMAGES,
  NATIVE_IMAGE_MIME,
} from "@/lib/native-listings/constants";
import {
  reorderNativeImages,
  uploadNativeImages,
} from "@/lib/native-listings/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const ALLOWED = new Set<string>(NATIVE_IMAGE_MIME);

export async function POST(
  request: Request,
  context: { params: Params },
) {
  try {
    assertLabsAdminSession(request);
    const { id } = await context.params;
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }
    if (files.length > MAX_NATIVE_IMAGES) {
      return NextResponse.json(
        { error: `Upload at most ${MAX_NATIVE_IMAGES} images at a time.` },
        { status: 400 },
      );
    }

    const prepared: Array<{ name: string; type: string; bytes: ArrayBuffer }> =
      [];
    for (const file of files) {
      if (!ALLOWED.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported image type: ${file.type || file.name}` },
          { status: 400 },
        );
      }
      if (file.size > MAX_NATIVE_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `${file.name} exceeds the 5MB limit.` },
          { status: 400 },
        );
      }
      prepared.push({
        name: file.name,
        type: file.type,
        bytes: await file.arrayBuffer(),
      });
    }

    const result = await uploadNativeImages(id, prepared);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to upload images.",
      },
      { status },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Params },
) {
  try {
    assertLabsAdminSession(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const orderedPaths = Array.isArray(body.orderedPaths)
      ? body.orderedPaths.map(String)
      : [];
    if (!orderedPaths.length) {
      return NextResponse.json(
        { error: "orderedPaths is required." },
        { status: 400 },
      );
    }
    const result = await reorderNativeImages(id, orderedPaths);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to reorder images.",
      },
      { status },
    );
  }
}
