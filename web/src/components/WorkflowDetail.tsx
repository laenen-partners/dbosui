import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconBell,
  IconInfoCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconStack3,
  IconTrash,
  IconX,
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
import { STATUS_COLOR, STATUS_LABEL, formatTimestamp } from '../lib/format';
import { JsonBlock } from './JsonBlock';

type Props = {
  id: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
};

export function WorkflowDetail({ id, expanded, onToggleExpand, onClose }: Props) {
  const wfQuery = useWorkflow(id);
  const stepsQuery = useWorkflowSteps(id);
  const eventsQuery = useWorkflowEvents(id);

  const cancelMutation = useCancelWorkflow();
  const resumeMutation = useResumeWorkflow();
  const deleteMutation = useDeleteWorkflow();

  if (wfQuery.isLoading || !wfQuery.data?.workflow) {
    return (
      <Box p="xl">
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
      children: (
        <Text size="sm">
          {label} workflow <Code>{wf.id}</Code>?
        </Text>
      ),
      labels: { confirm: label, cancel: 'Back' },
      confirmProps: { color },
      onConfirm: run,
    });

  return (
    <Stack gap={0} h="100vh">
      {/* Sticky header */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px="md"
        py="sm"
        bg="var(--mantine-color-body)"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <Badge color={STATUS_COLOR[wf.status]} variant="light" radius="sm">
            {STATUS_LABEL[wf.status]}
          </Badge>
          <Box style={{ minWidth: 0 }}>
            <Title order={5} lineClamp={1}>
              {wf.name}
            </Title>
            <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
              {wf.id}
            </Text>
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={expanded ? 'Collapse' : 'Expand'}>
            <ActionIcon variant="subtle" color="gray" onClick={onToggleExpand}>
              {expanded ? (
                <IconArrowsDiagonalMinimize2 size={18} />
              ) : (
                <IconArrowsDiagonal size={18} />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close">
            <ActionIcon variant="subtle" color="gray" onClick={onClose}>
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Action row */}
      <Group px="md" py="xs" gap="xs">
        {canCancel && (
          <Button
            size="xs"
            leftSection={<IconPlayerPause size={14} />}
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
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
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
          size="xs"
          leftSection={<IconTrash size={14} />}
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

      <Tabs defaultValue="overview" variant="default" keepMounted={false}>
        <Tabs.List px="md">
          <Tabs.Tab value="overview" leftSection={<IconInfoCircle size={14} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="steps" leftSection={<IconStack3 size={14} />}>
            Steps{' '}
            {stepsQuery.data?.steps?.length
              ? `(${stepsQuery.data.steps.length})`
              : ''}
          </Tabs.Tab>
          <Tabs.Tab value="events" leftSection={<IconBell size={14} />}>
            Events{' '}
            {eventsQuery.data?.events?.length
              ? `(${eventsQuery.data.events.length})`
              : ''}
          </Tabs.Tab>
        </Tabs.List>

        <ScrollArea style={{ flex: 1 }} type="hover">
          <Tabs.Panel value="overview" p="md">
            <Stack gap="md">
              <Card withBorder radius="md" p="md">
                <Title order={6} mb="xs" c="dimmed" fz="xs" tt="uppercase">
                  Metadata
                </Title>
                <SimpleGrid cols={expanded ? 3 : 2} spacing="sm" verticalSpacing="sm">
                  <KV label="Created" value={formatTimestamp(wf.createdAt)} />
                  <KV label="Updated" value={formatTimestamp(wf.updatedAt)} />
                  <KV label="User" value={wf.authenticatedUser || '—'} />
                  <KV label="Queue" value={wf.queueName || '—'} />
                  <KV label="Attempts" value={String(wf.attempts)} />
                  <KV label="App version" value={wf.applicationVersion || '—'} />
                  <KV label="App ID" value={wf.applicationId || '—'} />
                  <KV label="Executor" value={wf.executorId || '—'} mono />
                </SimpleGrid>
              </Card>

              {wf.error && (
                <Card withBorder radius="md" p="md" bg="var(--mantine-color-red-light)">
                  <Title order={6} mb="xs" c="red" fz="xs" tt="uppercase">
                    Error
                  </Title>
                  <Code block>{wf.error}</Code>
                </Card>
              )}

              {wf.inputJson && (
                <Card withBorder radius="md" p="md">
                  <Title order={6} mb="xs" c="dimmed" fz="xs" tt="uppercase">
                    Input
                  </Title>
                  <JsonBlock value={wf.inputJson} />
                </Card>
              )}

              {wf.outputJson && (
                <Card withBorder radius="md" p="md">
                  <Title order={6} mb="xs" c="dimmed" fz="xs" tt="uppercase">
                    Output
                  </Title>
                  <JsonBlock value={wf.outputJson} />
                </Card>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="steps" p="md">
            {stepsQuery.isLoading ? (
              <Loader size="sm" />
            ) : stepsQuery.data?.steps?.length ? (
              <Card withBorder radius="md" p={0}>
                <Table verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={50}>#</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Output / Error</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {stepsQuery.data.steps.map((s) => (
                      <Table.Tr key={s.stepId}>
                        <Table.Td>
                          <Text c="dimmed" size="sm">
                            {s.stepId}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={500}>{s.name}</Text>
                        </Table.Td>
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
              </Card>
            ) : (
              <EmptyState text="No steps recorded for this workflow." />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="events" p="md">
            {eventsQuery.isLoading ? (
              <Loader size="sm" />
            ) : eventsQuery.data?.events?.length ? (
              <Card withBorder radius="md" p={0}>
                <Table verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={180}>Key</Table.Th>
                      <Table.Th>Value</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {eventsQuery.data.events.map((e) => (
                      <Table.Tr key={e.key}>
                        <Table.Td>
                          <Text ff="monospace" size="sm">
                            {e.key}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <JsonBlock value={e.value} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>
            ) : (
              <EmptyState text="No events emitted." />
            )}
          </Tabs.Panel>
        </ScrollArea>
      </Tabs>
    </Stack>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <Text size="sm" ff={mono ? 'monospace' : undefined}>
        {value}
      </Text>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box ta="center" py="xl">
      <Text c="dimmed" size="sm">
        {text}
      </Text>
    </Box>
  );
}
