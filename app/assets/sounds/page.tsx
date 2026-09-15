import { redirect } from "next/navigation"

export default function SoundsPage() {
  redirect("/assets/characters?sounds=1")
}
