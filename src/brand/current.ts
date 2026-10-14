/** The presenter's brand this browser asked for (src/brand/demo.ts), read in server components and route handlers. */
import { cookies } from "next/headers";
import { BRAND_COOKIE, brandFrom, type DemoBrand } from "./demo";

export async function currentBrand(): Promise<DemoBrand | null> {
  return brandFrom((await cookies()).get(BRAND_COOKIE)?.value);
}
