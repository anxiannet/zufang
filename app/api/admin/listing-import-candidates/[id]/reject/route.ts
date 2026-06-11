import { updateCandidateStatus } from "../status";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return updateCandidateStatus(context, "rejected");
}
