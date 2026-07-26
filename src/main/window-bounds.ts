const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;
const COORD_MIN = -1000;
const COORD_MAX = 10000;

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export function validateBounds(parsed: unknown): WindowBounds | null {
  if (
    typeof parsed !== "object" || parsed === null ||
    typeof (parsed as Record<string, unknown>).width !== "number" ||
    typeof (parsed as Record<string, unknown>).height !== "number"
  ) return null;

  const p = parsed as Record<string, unknown>;

  const w = p.width as number;
  const h = p.height as number;

  if (w <= 0 || w > MAX_WIDTH || h <= 0 || h > MAX_HEIGHT) return null;

  const result: WindowBounds = { width: w, height: h };

  if (typeof p.x === "number") {
    result.x = p.x >= COORD_MIN && p.x <= COORD_MAX ? p.x : undefined;
  }

  if (typeof p.y === "number") {
    result.y = p.y >= COORD_MIN && p.y <= COORD_MAX ? p.y : undefined;
  }

  if (typeof p.maximized === "boolean") result.maximized = p.maximized;

  return result;
}
