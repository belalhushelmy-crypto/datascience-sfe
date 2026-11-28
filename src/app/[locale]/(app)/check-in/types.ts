export type CheckInState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };
