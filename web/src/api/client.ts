import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient } from '@connectrpc/connect';

import { WorkflowService } from '../gen/dbosui/v1/workflows_pb.js';

// Resolve the API base URL from the document's <base href> so it works under
// any mount path (e.g. "/" in standalone mode, "/dbos" when embedded).
function apiBaseUrl(): string {
  const base = new URL(document.baseURI);
  base.pathname = base.pathname.replace(/\/$/, '') + '/api';
  base.search = '';
  base.hash = '';
  return base.toString();
}

const transport = createConnectTransport({
  baseUrl: apiBaseUrl(),
});

export const workflowClient = createClient(WorkflowService, transport);
