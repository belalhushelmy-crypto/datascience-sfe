export type ProfileState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; message: string };
