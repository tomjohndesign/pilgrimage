import { redirect } from "next/navigation"

/** Keep existing workshop bookmarks pointed at the shared playground. */
export default function BuildingsPage() { redirect("/assets/characters?asset=buildings") }
