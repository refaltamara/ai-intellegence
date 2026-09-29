/** RFC 9728: where the connector's tokens come from. Served at the root and at the resource-path suffix. */
import { CORS, metadata, originOf } from "@/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(metadata(originOf(req.headers)).resource, { headers: CORS });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
