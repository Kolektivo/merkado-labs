import "server-only";

const WORKFLOW_FILE = "property-pipeline-labs.yml";

export type PipelineDispatchInput = {
  pipelineRunId: string;
  sourceKeys: string[];
  dryRun?: boolean;
};

export async function dispatchPropertyPipelineWorkflow(
  input: PipelineDispatchInput,
): Promise<{ workflowRef: string; dispatchStatus: "dispatched" }> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const workflowRef = process.env.PROPERTY_PIPELINE_GITHUB_REF?.trim() || "main";
  if (!token) throw new Error("GITHUB_TOKEN is not configured on the server");
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be configured as owner/repository");
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: workflowRef,
        inputs: {
          trigger_type: input.dryRun ? "dry_run" : "manual",
          pipeline_run_id: input.pipelineRunId,
          source_keys: input.sourceKeys.join(","),
          dry_run: String(Boolean(input.dryRun)),
        },
      }),
      cache: "no-store",
    },
  );
  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `GitHub workflow dispatch failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return { workflowRef, dispatchStatus: "dispatched" };
}
