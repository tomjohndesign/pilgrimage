export const WILDLIFE_STEP_SECONDS = 1 / 30

/** Beyond this view size, wildlife is only a few pixels across. */
const DISTANT_VIEW_SIZE = 90
const DISTANT_POSE_SECONDS = 3 * WILDLIFE_STEP_SECONDS

/** Animal age is measured in seconds, including its random initial offset.
 * Nearby animals follow every simulation update; distant hides refresh at 10 Hz.
 * Allow rounding error when accumulated steps reach the distant interval. */
export function wildlifePoseDue(age: number, posedAge: number, viewSize: number) {
  if (age === posedAge) return false
  if (posedAge < 0 || age < posedAge || viewSize <= DISTANT_VIEW_SIZE) return true
  return age - posedAge >= DISTANT_POSE_SECONDS - 1e-8
}
