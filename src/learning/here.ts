/**
 * A signal from a request (a page or a route): the person, workspace and team come from
 * the session (src/auth/current.ts), never from the body.
 */
import { currentActor, currentRole, currentWorkspaceId } from "../auth/current";
import type { RoleId } from "../roles/model";
import type { SignalKind } from "./kinds";
import { by, signal } from "./signals";

export async function signalHere(kind: SignalKind, payload: Record<string, unknown> = {}, role?: RoleId): Promise<void> {
  try {
    const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
    if (!actor) return;
    await signal(by(actor, ws, role ?? (await currentRole(ws)).id), kind, payload);
  } catch (e) {
    console.error("[signal] no session:", kind, (e as Error).message);
  }
}
