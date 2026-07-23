import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { NativeListingWizard } from "@/components/native-listing/native-listing-wizard";
import { PageHeader } from "@/components/page-header";
import { getNativeListing } from "@/lib/native-listings/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit property" };

type Params = Promise<{ id: string }>;

export default async function EditNativeListingPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const result = await getNativeListing(id);
  if (!result) notFound();

  const listing = result.listing;
  const features = Array.isArray(listing.owner_attributes)
    ? listing.owner_attributes
        .map((item: { key?: string }) => item?.key)
        .filter((key: unknown): key is string => typeof key === "string")
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit property"
        description="Update a Labs admin native listing. Changes append immutable activity events."
        icon={Pencil}
      />
      <NativeListingWizard
        mode="edit"
        listingId={id}
        initialValues={{
          listingType: listing.listing_type ?? "sale",
          title: listing.title ?? "",
          realEstateType: listing.real_estate_type ?? listing.property_type ?? "house",
          neighbourhood: listing.source_neighbourhood_text ?? "",
          originalPrice:
            listing.original_price == null ? "" : String(listing.original_price),
          originalCurrency: listing.original_currency ?? "XCG",
          bedrooms: listing.bedrooms == null ? "" : String(listing.bedrooms),
          bathrooms: listing.bathrooms == null ? "" : String(listing.bathrooms),
          floorAreaM2:
            listing.floor_area_m2 == null ? "" : String(listing.floor_area_m2),
          lotAreaValue:
            listing.lot_area_value == null ? "" : String(listing.lot_area_value),
          lotAreaUnit: listing.lot_area_unit ?? "m2",
          description: listing.description ?? "",
          features,
          contactName: listing.contact_name ?? "",
          contactMethod: listing.contact_method ?? "whatsapp",
          contactValue: listing.contact_value ?? "",
        }}
        initialImages={result.images.map((image) => ({
          storagePath: image.storage_path,
          publicUrl: image.public_url,
          sortOrder: image.sort_order,
          isPrimary: image.is_primary,
        }))}
      />
    </div>
  );
}
