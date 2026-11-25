export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(ok: unknown, code: number, message: string): asserts ok {
  if (!ok) throw new AppError(code, message);
}
