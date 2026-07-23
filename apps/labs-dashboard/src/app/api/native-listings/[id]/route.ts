import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import {
  getNativeListing,
  updateNativeListing,
} from "@/lib/native-listings/service";
import type { NativeListingInput } from "@/lib/native-listings/validation";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

function bodyToInput(body: Record<string, unknown>): NativeListingInput {
  const optionalNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    listingType: typeof body.listingType === "string" ? body.listingType : null,
    title: typeof body.title === "string" ? body.title : null,
    realEstateType:
      typeof body.realEstateType === "string" ? body.realEstateType : null,
    neighbourhood:
      typeof body.neighbourhood === "string" ? body.neighbourhood : null,
    originalPrice: optionalNumber(body.originalPrice),
    originalCurrency:
      typeof body.originalCurrency === "string" ? body.originalCurrency : null,
    bedrooms: optionalNumber(body.bedrooms),
    bathrooms: optionalNumber(body.bathrooms),
    floorAreaM2: optionalNumber(body.floorAreaM2),
    lotAreaValue: optionalNumber(body.lotAreaValue),
    lotAreaUnit: typeof body.lotAreaUnit === "string" ? body.lotAreaUnit : null,
    description: typeof body.description === "string" ? body.description : null,
    features: Array.isArray(body.features) ? body.features.map(String) : [],
    contactName: typeof body.contactName === "string" ? body.contactName : null,
    contactMethod:
      typeof body.contactMethod === "string" ? body.contactMethod : null,
    contactValue:
      typeof body.contactValue === "string" ? body.contactValue : null,
  };
}

export async function GET(
  request: Request,
  context: { params: Params },
) {
  try {
    assertLabsAdminSession(request);
    const { id } = await context.params;
    const result = await getNativeListing(id);
    if (!result) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load listing.",
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
    const result = await updateNativeListing(id, bodyToInput(body));
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update listing.",
      },
      { status },
    );
  }
}
