import { useMemo } from 'react';
import { Badge, Stack, Text, Title } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { Link } from 'react-router-dom';

import { useQueueStats } from '../api/queries';
import type { QueueStats } from '../gen/dbosui/v1/workflows_pb';

export function QueuesPage() {
  const { data, isLoading } = useQueueStats();

  const columns = useMemo(
    () => [
      {
        accessor: 'queueName',
        title: 'Queue',
        render: (q: QueueStats) =>
          q.queueName ? (
            <Text fw={500}>
              <Link
                to={`/?queue=${encodeURIComponent(q.queueName)}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {q.queueName}
              </Link>
            </Text>
          ) : (
            <Text c="dimmed" fs="italic">
              (no queue)
            </Text>
          ),
      },
      countColumn('total', 'Total', 'gray'),
      countColumn('pending', 'Pending', 'yellow'),
      countColumn('enqueued', 'Enqueued', 'cyan'),
      countColumn('success', 'Success', 'green'),
      countColumn('failed', 'Failed', 'red'),
      countColumn('cancelled', 'Cancelled', 'gray'),
    ],
    [],
  );

  return (
    <Stack>
      <Title order={3}>Queues</Title>
      <Text size="sm" c="dimmed">
        Workflow distribution across DBOS queues. Click a queue name to filter
        the workflow list to it.
      </Text>

      <DataTable<QueueStats>
        withTableBorder
        borderRadius="md"
        verticalAlign="center"
        minHeight={300}
        fetching={isLoading}
        columns={columns}
        records={data?.queues ?? []}
        idAccessor="queueName"
        noRecordsText="No queues found"
      />
    </Stack>
  );
}

function countColumn(
  key: keyof QueueStats,
  title: string,
  color: string,
) {
  return {
    accessor: key as string,
    title,
    textAlign: 'right' as const,
    render: (q: QueueStats) => {
      const v = q[key] as number;
      return v > 0 ? (
        <Badge color={color} variant="light" radius="sm">
          {v}
        </Badge>
      ) : (
        <Text size="sm" c="dimmed">
          0
        </Text>
      );
    },
  };
}
