export function supabaseErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim() !== ""
  ) {
    return error.message
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message
  }
  return fallback
}
