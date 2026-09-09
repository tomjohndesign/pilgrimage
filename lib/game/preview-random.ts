/** A fresh world seed for an explicit playground action; game rolls remain seeded. */
export function previewRandomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}
