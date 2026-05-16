import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconRefresh, IconX } from '@tabler/icons-react';

import { useNotifications } from '../api/queries';
import type { Notification } from '../gen/dbosui/v1/workflows_pb';
import { formatTimestamp, truncate } from '../lib/format';
import { JsonBlock } from '../components/JsonBlock';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [destinationFilter, setDestinationFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');

  const params = useMemo(
    () => ({
      destinationWorkflowId: destinationFilter,
      topic: topicFilter,
      limit: recordsPerPage,
      offset: (page - 1) * recordsPerPage,
    }),
    [destinationFilter, topicFilter, page, recordsPerPage],
  );

  const { data, isLoading, isFetching, refetch } = useNotifications(params);

  const hasFilters = destinationFilter !== '' || topicFilter !== '';
  const resetFilters = () => {
    setDestinationFilter('');
    setTopicFilter('');
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        accessor: 'destinationWorkflowId',
        title: 'Destination workflow',
        render: (n: Notification) => (
          <Text ff="monospace" size="xs">
            {truncate(n.destinationWorkflowId, 32)}
          </Text>
        ),
      },
      {
        accessor: 'topic',
        title: 'Topic',
        render: (n: Notification) =>
          n.topic ? (
            <Badge variant="light" radius="sm">
              {n.topic}
            </Badge>
          ) : (
            <Text c="dimmed" size="sm">
              —
            </Text>
          ),
      },
      {
        accessor: 'message',
        title: 'Message',
        render: (n: Notification) => (
          <Box maw={420}>
            <JsonBlock value={n.message} />
          </Box>
        ),
      },
      {
        accessor: 'createdAt',
        title: 'Created',
        render: (n: Notification) => formatTimestamp(n.createdAt),
      },
    ],
    [],
  );

  return (
    <Stack>
      <Box>
        <Title order={3}>Notifications</Title>
        <Text size="sm" c="dimmed">
          Inbox of messages sent via <code>dbos.Send</code> and awaiting
          consumption by <code>dbos.Recv</code>.
        </Text>
      </Box>

      <Paper withBorder p="sm">
        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            placeholder="Destination workflow ID"
            value={destinationFilter}
            onChange={(e) => {
              setDestinationFilter(e.currentTarget.value);
              setPage(1);
            }}
            w={280}
          />
          <TextInput
            placeholder="Topic (exact match)"
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.currentTarget.value);
              setPage(1);
            }}
            w={220}
          />
          {hasFilters && (
            <ActionIcon variant="subtle" color="gray" onClick={resetFilters}>
              <IconX size={16} />
            </ActionIcon>
          )}
          <Box style={{ flex: 1 }} />
          <Tooltip label="Refresh">
            <ActionIcon
              variant="subtle"
              onClick={() => refetch()}
              loading={isFetching}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>

      <DataTable<Notification>
        withTableBorder
        borderRadius="md"
        verticalAlign="top"
        minHeight={300}
        fetching={isLoading}
        columns={columns}
        records={data?.notifications ?? []}
        totalRecords={data?.total ?? 0}
        page={page}
        onPageChange={setPage}
        recordsPerPage={recordsPerPage}
        onRecordsPerPageChange={setRecordsPerPage}
        recordsPerPageOptions={PAGE_SIZE_OPTIONS}
        idAccessor={(n) =>
          `${n.destinationWorkflowId}|${n.topic}|${
            n.createdAt?.seconds ?? 0n
          }`
        }
        noRecordsText="No notifications match the current filters"
      />
    </Stack>
  );
}
