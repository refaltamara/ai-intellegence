/** Client uploads to private Vercel Blob (dumps are larger than a request may carry): a token per file, for Fair's data ops only. */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const actor = await currentActor();
        if (!actor || !can(actor, "workspace.data")) throw new Error("forbidden");
        if (!/^onboard\/[a-z0-9-]+\/[^/]+\.csv$/i.test(pathname)) throw new Error("Only a dump's CSV files.");
        return { allowedContentTypes: ["text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"], maximumSizeInBytes: 2 * 1024 ** 3, addRandomSuffix: true };
      },
      onUploadCompleted: async () => undefined,
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
