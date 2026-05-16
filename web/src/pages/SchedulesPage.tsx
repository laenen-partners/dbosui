import { useMemo } from 'react';
import { Badge, Code, Stack, Text, Title } from '@mantine/core';
import { DataTable } from 'mantine-datatable';

import { useSchedules } from '../api/queries';
import type { Schedule } from '../gen/dbosui/v1/workflows_pb';
import { formatTimestamp } from '../lib/format';

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'green';
  if (s === 'PAUSED') return 'yellow';
  if (s === 'DISABLED' || s === 'CANCELLED') return 'gray';
  return 'gray';
}

export function SchedulesPage() {
  const { data, isLoading } = useSchedules();

  const columns = useMemo(
    () => [
      {
        accessor: 'scheduleName',
        title: 'Name',
        render: (s: Schedule) => <Text fw={500}>{s.scheduleName}</Text>,
      },
      {
        accessor: 'workflowName',
        title: 'Workflow',
        render: (s: Schedule) => (
          <Text size="sm">
            {s.workflowName}
            {s.workflowClassName && (
              <Text component="span" size="xs" c="dimmed" ml={4}>
                ({s.workflowClassName})
              </Text>
            )}
          </Text>
        ),
      },
      {
        accessor: 'schedule',
        title: 'Schedule',
        render: (s: Schedule) => <Code>{s.schedule}</Code>,
      },
      {
        accessor: 'queueName',
        title: 'Queue',
        render: (s: Schedule) =>
          s.queueName ? (
            <Text size="sm">{s.queueName}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          ),
      },
      {
        accessor: 'status',
        title: 'Status',
        render: (s: Schedule) => (
          <Badge color={statusColor(s.status)} variant="light" radius="sm">
            {s.status || 'UNKNOWN'}
          </Badge>
        ),
      },
      {
        accessor: 'lastFiredAt',
        title: 'Last fired',
        render: (s: Schedule) => formatTimestamp(s.lastFiredAt),
      },
      {
        accessor: 'cronTimezone',
        title: 'Timezone',
        render: (s: Schedule) =>
          s.cronTimezone ? (
            <Text size="sm">{s.cronTimezone}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          ),
      },
    ],
    [],
  );

  return (
    <Stack>
      <Title order={3}>Scheduled workflows</Title>
      <Text size="sm" c="dimmed">
        Cron and interval-driven workflows registered with{' '}
        <Code>dbos.Schedule</Code>. Pulled from{' '}
        <Code>dbos.workflow_schedules</Code>; empty if the host app hasn't
        registered any (or the system DB predates migration 9).
      </Text>

      <DataTable<Schedule>
        withTableBorder
        borderRadius="md"
        verticalAlign="center"
        minHeight={300}
        fetching={isLoading}
        columns={columns}
        records={data?.schedules ?? []}
        idAccessor="scheduleId"
        noRecordsText="No scheduled workflows registered"
      />
    </Stack>
  );
}
