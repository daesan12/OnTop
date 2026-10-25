export class RestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly nextAllowedAt?: string) { super(message) }
}
