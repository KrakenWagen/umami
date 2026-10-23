export class PostHogRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PostHogRequestError';
    this.status = status;
  }
}
