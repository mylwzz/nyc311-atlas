/// <reference lib="webworker" />

import {
  deterministicUncertainty,
  type UncertaintyRequest,
} from "@/lib/uncertainty";

interface WorkloadWorkerRequest {
  id: number;
  request: UncertaintyRequest;
}

interface WorkloadWorkerResponse {
  id: number;
  result?: ReturnType<typeof deterministicUncertainty>;
  error?: string;
}

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<WorkloadWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const response: WorkloadWorkerResponse = {
      id,
      result: deterministicUncertainty(request),
    };
    worker.postMessage(response);
  } catch (error) {
    const response: WorkloadWorkerResponse = {
      id,
      error:
        error instanceof Error
          ? error.message
          : "Workload uncertainty could not be evaluated.",
    };
    worker.postMessage(response);
  }
};

export {};
