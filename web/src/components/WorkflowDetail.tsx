import {
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';

import {
  useCancelWorkflow,
  useDeleteWorkflow,
  useResumeWorkflow,
  useWorkflow,
  useWorkflowEvents,
  useWorkflowSteps,
} from '../api/queries';
import { WorkflowStatus } from '../gen/dbosui/v1/workflows_pb';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  formatTimestamp,
} from '../lib/format';
import { JsonBlock } from './JsonBlock';

type Props = { id: string; onClose: () => void };

export function WorkflowDetail({ id, onClose }: Props) {
  const wfQuery = useWorkflow(id);
  const stepsQuery = useWorkflowSteps(id);
  const eventsQuery = useWorkflowEvents(id);

  const cancelMutation = useCancelWorkflow();
  const resumeMutation = useResumeWorkflow();
  const deleteMutation = useDeleteWorkflow();

  if (wfQuery.isLoading || !wfQuery.data?.workflow) {
    return (
      <Box>
        <Loader />
      </Box>
    );
  }

  const wf = wfQuery.data.workflow;
  const canCancel =
    wf.status === WorkflowStatus.PENDING || wf.status === WorkflowStatus.ENQUEUED;
  const canResume =
    wf.status === WorkflowStatus.CANCELLED ||
    wf.status === WorkflowStatus.ERROR ||
    wf.status === WorkflowStatus.MAX_RETRIES_EXCEEDED;

  const confirmAction = (label: string, color: string, run: () => void) =>
    modals.openConfirmModal({
      title: `${label} workflow`,
      children: <Text size="sm">{label} workflow {wf.id}?</Text>,
      labels: { confirm: label, cancel: 'Back' },
      confirmProps: { color },
      onConfirm: run,
    });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Box>
          <Title order={4}>{wf.name}</Title>
          <Text size="xs" c="dimmed">
            {wf.id}
          </Text>
        </Box>
        <Badge color={STATUS_COLOR[wf.status]} variant="light">
          {STATUS_LABEL[wf.status]}
        </Badge>
      </Group>

      <Group>
        {canCancel && (
          <Button
            leftSection={<IconPlayerPause size={16} />}
            color="red"
            variant="light"
            loading={cancelMutation.isPending}
            onClick={() =>
              confirmAction('Cancel', 'red', () =>
                cancelMutation.mutate(wf.id, { onSuccess: onClose }),
              )
            }
          >
            Cancel
          </Button>
        )}
        {canResume && (
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            variant="light"
            loading={resumeMutation.isPending}
            onClick={() =>
              confirmAction('Resume', 'indigo', () =>
                resumeMutation.mutate(wf.id, { onSuccess: onClose }),
              )
            }
          >
            Resume
          </Button>
        )}
        <Button
          leftSection={<IconTrash size={16} />}
          color="red"
          variant="subtle"
          loading={deleteMutation.isPending}
          onClick={() =>
            confirmAction('Delete', 'red', () =>
              deleteMutation.mutate(wf.id, { onSuccess: onClose }),
            )
          }
        >
          Delete
        </Button>
      </Group>

      <Divider />

      <Table withRowBorders={false} verticalSpacing="xs">
        <Table.Tbody>
          <KV label="Created" value={formatTimestamp(wf.createdAt)} />
          <KV label="Updated" value={formatTimestamp(wf.updatedAt)} />
          <KV label="User" value={wf.authenticatedUser || '—'} />
          <KV label="Queue" value={wf.queueName || '—'} />
          <KV label="Attempts" value={String(wf.attempts)} />
          <KV label="App version" value={wf.applicationVersion || '—'} />
          <KV label="App ID" value={wf.applicationId || '—'} />
          <KV label="Executor" value={wf.executorId || '—'} />
        </Table.Tbody>
      </Table>

      {wf.error && (
        <Box>
          <Title order={6} c="red">
            Error
          </Title>
          <Code block>{wf.error}</Code>
        </Box>
      )}

      {wf.inputJson && (
        <Box>
          <Title order={6}>Input</Title>
          <JsonBlock value={wf.inputJson} />
        </Box>
      )}

      {wf.outputJson && (
        <Box>
          <Title order={6}>Output</Title>
          <JsonBlock value={wf.outputJson} />
        </Box>
      )}

      <Box>
        <Title order={6}>Steps</Title>
        {stepsQuery.isLoading ? (
          <Loader size="sm" />
        ) : stepsQuery.data?.steps?.length ? (
          <Table withTableBorder withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Output / Error</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stepsQuery.data.steps.map((s) => (
                <Table.Tr key={s.stepId}>
                  <Table.Td>{s.stepId}</Table.Td>
                  <Table.Td>{s.name}</Table.Td>
                  <Table.Td>
                    {s.error ? (
                      <Code block c="red">
                        {s.error}
                      </Code>
                    ) : (
                      <JsonBlock value={s.outputJson} />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed" size="sm">
            No steps recorded.
          </Text>
        )}
      </Box>

      <Box>
        <Title order={6}>Events</Title>
        {eventsQuery.isLoading ? (
          <Loader size="sm" />
        ) : eventsQuery.data?.events?.length ? (
          <Table withTableBorder withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Key</Table.Th>
                <Table.Th>Value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {eventsQuery.data.events.map((e) => (
                <Table.Tr key={e.key}>
                  <Table.Td>{e.key}</Table.Td>
                  <Table.Td>
                    <JsonBlock value={e.value} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed" size="sm">
            No events.
          </Text>
        )}
      </Box>
    </Stack>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <Table.Tr>
      <Table.Td w={140}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{value}</Text>
      </Table.Td>
    </Table.Tr>
  );
}
