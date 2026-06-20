export type ResponseStatus =
  | "success"
  | "info"
  | "warning"
  | "error"
  | "created"
  | "updated"
  | "deleted"
  | "validationError"
  | "notFound"
  | "unauthorized"
  | "forbidden";

export interface Response<T = unknown> {
  status: ResponseStatus;
  message: string;
  data: T;
}

export function isSuccess<T>(r: Response<T>): boolean {
  return ["success", "created", "updated", "deleted"].includes(r.status);
}

export function getData<T>(response: Response<unknown>): T | null {
  return (response.data as T) ?? null;
}
