export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly expose = false
  ) {
    super(message);
  }
}

export function publicErrorMessage(error: unknown, production: boolean): string {
  if (error instanceof AppError && error.expose) return error.message;
  if (!production && error instanceof Error) return error.message;
  return "Internal server error";
}
