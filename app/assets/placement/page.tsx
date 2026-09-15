import { redirect } from "next/navigation"
import { legacyPlaygroundHref } from "@/lib/asset-playground"

/** Preserve bookmarks and shared settings in the unified playground. */
export default async function LegacyToolPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(legacyPlaygroundHref(await searchParams, "placement"))
}
