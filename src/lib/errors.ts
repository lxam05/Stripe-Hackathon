/** An expected, user-facing failure. API routes turn it into the {error:{code,message}} envelope. */
export class UserError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
