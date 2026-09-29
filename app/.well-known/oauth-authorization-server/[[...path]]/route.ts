/** RFC 8414: the authorization server behind the connector (this app, over the normal sign-in). */
import { CORS, metadata, originOf } from "@/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(metadata(originOf(req.headers)).server, { headers: CORS });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
