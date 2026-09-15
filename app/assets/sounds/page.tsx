import { redirect } from "next/navigation"

export default function SoundsPage() {
  redirect("/assets?asset=characters&sounds=1")
}
