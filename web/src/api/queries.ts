import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

import { workflowClient } from './client.js';
import type { WorkflowField, WorkflowStatus } from '../gen/dbosui/v1/workflows_pb.js';

export type ListParams = {
  statuses: WorkflowStatus[];
  name: string;
  queueName: string;
  executorId: string;
  applicationVersion: string;
  user: string;
  idPrefix: string;
  createdAfter: Date | null;
  createdBefore: Date | null;
  limit: number;
  offset: number;
  sortDesc: boolean;
  refetchIntervalMs?: number;
};

export function useWorkflows(params: ListParams) {
  return useQuery({
    queryKey: [
      'workflows',
      { ...params, refetchIntervalMs: undefined }, // refetch interval isn't part of the cache key
    ],
    queryFn: () =>
      workflowClient.listWorkflows({
        statuses: params.statuses,
        name: params.name,
        queueName: params.queueName,
        executorId: params.executorId,
        applicationVersion: params.applicationVersion,
        user: params.user,
        idPrefix: params.idPrefix,
        createdAfter: params.createdAfter
          ? timestampFromDate(params.createdAfter)
          : undefined,
        createdBefore: params.createdBefore
          ? timestampFromDate(params.createdBefore)
          : undefined,
        limit: params.limit,
        offset: params.offset,
        sortDesc: params.sortDesc,
      }),
    placeholderData: (prev) => prev,
    refetchInterval: params.refetchIntervalMs ?? false,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => workflowClient.getStats({}),
  });
}

export function useActivity(hours = 24) {
  return useQuery({
    queryKey: ['activity', hours],
    queryFn: () => workflowClient.getActivity({ hours }),
    staleTime: 30_000,
  });
}

export function useQueueStats() {
  return useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => workflowClient.listQueueStats({}),
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: () => workflowClient.listSchedules({}),
    staleTime: 60_000,
  });
}

export type NotificationParams = {
  destinationWorkflowId: string;
  topic: string;
  limit: number;
  offset: number;
};

export function useNotifications(params: NotificationParams) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () =>
      workflowClient.listNotifications({
        destinationWorkflowId: params.destinationWorkflowId,
        topic: params.topic,
        limit: params.limit,
        offset: params.offset,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useDistinctValues(field: WorkflowField) {
  return useQuery({
    queryKey: ['distinct', field],
    queryFn: () => workflowClient.listDistinctValues({ field }),
    staleTime: 60_000,
  });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowClient.getWorkflow({ id: id! }),
    enabled: !!id,
  });
}

export function useWorkflowSteps(id: string | null) {
  return useQuery({
    queryKey: ['workflow-steps', id],
    queryFn: () => workflowClient.getWorkflowSteps({ id: id! }),
    enabled: !!id,
  });
}

export function useWorkflowEvents(id: string | null) {
  return useQuery({
    queryKey: ['workflow-events', id],
    queryFn: () => workflowClient.getWorkflowEvents({ id: id! }),
    enabled: !!id,
  });
}

function invalidateWorkflowQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['workflows'] });
  qc.invalidateQueries({ queryKey: ['stats'] });
  qc.invalidateQueries({ queryKey: ['activity'] });
  qc.invalidateQueries({ queryKey: ['queue-stats'] });
}

/** Runs an action over a list of IDs in parallel, counts success/failure. */
async function runBulk(
  ids: string[],
  action: (id: string) => Promise<unknown>,
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(ids.map(action));
  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok++;
    else failed++;
  }
  return { ok, failed };
}

export function useBulkCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      runBulk(ids, (id) => workflowClient.cancelWorkflow({ id })),
    onSuccess: ({ ok, failed }, ids) => {
      notifications.show({
        color: failed > 0 ? 'orange' : 'green',
        message:
          failed > 0
            ? `Cancelled ${ok} of ${ids.length} workflows (${failed} failed)`
            : `Cancelled ${ok} workflows`,
      });
      invalidateWorkflowQueries(qc);
    },
  });
}

export function useBulkDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      runBulk(ids, (id) => workflowClient.deleteWorkflow({ id })),
    onSuccess: ({ ok, failed }, ids) => {
      notifications.show({
        color: failed > 0 ? 'orange' : 'green',
        message:
          failed > 0
            ? `Deleted ${ok} of ${ids.length} workflows (${failed} failed)`
            : `Deleted ${ok} workflows`,
      });
      invalidateWorkflowQueries(qc);
    },
  });
}

export function useCancelWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowClient.cancelWorkflow({ id }),
    onSuccess: (_data, id) => {
      notifications.show({ color: 'green', message: `Workflow ${id} cancelled` });
      invalidateWorkflowQueries(qc);
    },
    onError: (err) => {
      notifications.show({ color: 'red', message: `Cancel failed: ${err.message}` });
    },
  });
}

export function useResumeWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowClient.resumeWorkflow({ id }),
    onSuccess: (_data, id) => {
      notifications.show({ color: 'green', message: `Workflow ${id} resumed` });
      invalidateWorkflowQueries(qc);
    },
    onError: (err) => {
      notifications.show({ color: 'red', message: `Resume failed: ${err.message}` });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowClient.deleteWorkflow({ id }),
    onSuccess: (_data, id) => {
      notifications.show({ color: 'green', message: `Workflow ${id} deleted` });
      invalidateWorkflowQueries(qc);
    },
    onError: (err) => {
      notifications.show({ color: 'red', message: `Delete failed: ${err.message}` });
    },
  });
}
