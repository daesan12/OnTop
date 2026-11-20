import { parkRuntime } from '../../../park/runtime/runtime'

/** Boarding uses the server facility contract without constructing the rendered flight route. */
export async function boardSleigh(id: string) {
  try {
    parkRuntime.stopMovement()
    await parkRuntime.useFacility(id, 0, new AbortController().signal)
    return true
  } catch {
    // FacilityClient reconciles rejected/ambiguous requests and exposes the server error.
    return false
  }
}
