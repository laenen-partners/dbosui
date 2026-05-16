import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Box,
  Drawer,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import { IconAlertTriangle, IconRefresh, IconX } from '@tabler/icons-react';

import { useDistinctValues, useWorkflows } from '../api/queries';
import {
  WorkflowField,
  WorkflowStatus,
  type Workflow,
} from '../gen/dbosui/v1/workflows_pb';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_OPTIONS,
  formatTimestamp,
  truncate,
} from '../lib/format';
import { StatsBar } from '../components/StatsBar';
import { WorkflowDetail } from '../components/WorkflowDetail';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(25);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Workflow>>({
    columnAccessor: 'createdAt',
    direction: 'desc',
  });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<string | null>(
    searchParams.get('queue'),
  );
  const [executorFilter, setExecutorFilter] = useState<string | null>(null);
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  // Clear the ?queue= param from the URL after we adopt it as filter state,
  // so the filter row remains the source of truth.
  useEffect(() => {
    if (searchParams.get('queue')) {
      const next = new URLSearchParams(searchParams);
      next.delete('queue');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = useMemo(
    () => ({
      statuses: statusFilter ? [Number(statusFilter) as WorkflowStatus] : [],
      name: nameFilter ?? '',
      queueName: queueFilter ?? '',
      executorId: executorFilter ?? '',
      applicationVersion: versionFilter ?? '',
      user: userFilter ?? '',
      limit: recordsPerPage,
      offset: (page - 1) * recordsPerPage,
      sortDesc: sortStatus.direction === 'desc',
    }),
    [
      statusFilter,
      nameFilter,
      queueFilter,
      executorFilter,
      versionFilter,
      userFilter,
      page,
      recordsPerPage,
      sortStatus.direction,
    ],
  );

  const { data, isLoading, isFetching, refetch } = useWorkflows(params);
  const names = useDistinctValues(WorkflowField.NAME);
  const queues = useDistinctValues(WorkflowField.QUEUE_NAME);
  const executors = useDistinctValues(WorkflowField.EXECUTOR_ID);
  const versions = useDistinctValues(WorkflowField.APPLICATION_VERSION);
  const users = useDistinctValues(WorkflowField.AUTHENTICATED_USER);

  const toOptions = (values: string[] | undefined) =>
    (values ?? []).map((v) => ({ value: v, label: v }));

  const hasFilters =
    statusFilter !== null ||
    nameFilter !== null ||
    queueFilter !== null ||
    executorFilter !== null ||
    versionFilter !== null ||
    userFilter !== null;

  const resetFilters = () => {
    setStatusFilter(null);
    setNameFilter(null);
    setQueueFilter(null);
    setExecutorFilter(null);
    setVersionFilter(null);
    setUserFilter(null);
    setPage(1);
  };

  const onFilterChange =
    (setter: (v: string | null) => void) => (v: string | null) => {
      setter(v);
      setPage(1);
    };

  const columns = useMemo(
    () => [
      {
        accessor: 'id',
        title: 'ID',
        render: (wf: Workflow) => (
          <Text ff="monospace" size="xs" c="dimmed">
            {truncate(wf.id, 28)}
          </Text>
        ),
      },
      {
        accessor: 'name',
        title: 'Name',
        sortable: false,
      },
      {
        accessor: 'status',
        title: 'Status',
        render: (wf: Workflow) => (
          <Badge color={STATUS_COLOR[wf.status]} variant="light" radius="sm">
            {STATUS_LABEL[wf.status]}
          </Badge>
        ),
      },
      {
        accessor: 'queueName',
        title: 'Queue',
        render: (wf: Workflow) =>
          wf.queueName ? (
            <Text size="sm">{wf.queueName}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          ),
      },
      {
        accessor: 'attempts',
        title: 'Attempts',
        textAlign: 'right' as const,
        render: (wf: Workflow) =>
          wf.attempts > 1 ? (
            <Badge
              color="orange"
              variant="light"
              radius="sm"
              leftSection={<IconAlertTriangle size={12} />}
            >
              {wf.attempts}
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">
              {wf.attempts}
            </Text>
          ),
      },
      {
        accessor: 'authenticatedUser',
        title: 'User',
        render: (wf: Workflow) => wf.authenticatedUser || '—',
      },
      {
        accessor: 'createdAt',
        title: 'Created',
        sortable: true,
        render: (wf: Workflow) => formatTimestamp(wf.createdAt),
      },
    ],
    [],
  );

  return (
    <Stack>
      <StatsBar />

      <Paper withBorder p="sm">
        <Group gap="sm" wrap="wrap" align="flex-end">
          <Select
            placeholder="All statuses"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={onFilterChange(setStatusFilter)}
            clearable
            w={170}
          />
          <Select
            placeholder="All workflow types"
            data={toOptions(names.data?.values)}
            value={nameFilter}
            onChange={onFilterChange(setNameFilter)}
            searchable
            clearable
            w={220}
            disabled={names.isLoading}
          />
          <Select
            placeholder="All queues"
            data={toOptions(queues.data?.values)}
            value={queueFilter}
            onChange={onFilterChange(setQueueFilter)}
            searchable
            clearable
            w={180}
            disabled={queues.isLoading}
          />
          <Select
            placeholder="All executors"
            data={toOptions(executors.data?.values)}
            value={executorFilter}
            onChange={onFilterChange(setExecutorFilter)}
            searchable
            clearable
            w={180}
            disabled={executors.isLoading}
          />
          <Select
            placeholder="All versions"
            data={toOptions(versions.data?.values)}
            value={versionFilter}
            onChange={onFilterChange(setVersionFilter)}
            searchable
            clearable
            w={160}
            disabled={versions.isLoading}
          />
          <Select
            placeholder="All users"
            data={toOptions(users.data?.values)}
            value={userFilter}
            onChange={onFilterChange(setUserFilter)}
            searchable
            clearable
            w={160}
            disabled={users.isLoading}
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

      <DataTable<Workflow>
        withTableBorder
        borderRadius="md"
        highlightOnHover
        striped
        verticalAlign="center"
        minHeight={400}
        fetching={isLoading}
        columns={columns}
        records={data?.workflows ?? []}
        totalRecords={data?.total ?? 0}
        page={page}
        onPageChange={setPage}
        recordsPerPage={recordsPerPage}
        onRecordsPerPageChange={setRecordsPerPage}
        recordsPerPageOptions={PAGE_SIZE_OPTIONS}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        idAccessor="id"
        onRowClick={({ record }) => setOpenId(record.id)}
        noRecordsText="No workflows match the current filters"
      />

      <Drawer
        opened={!!openId}
        onClose={() => {
          setOpenId(null);
          setDrawerExpanded(false);
        }}
        position="right"
        size={drawerExpanded ? '100%' : 'xl'}
        withCloseButton={false}
        keepMounted={false}
        padding={0}
      >
        {openId && (
          <WorkflowDetail
            id={openId}
            expanded={drawerExpanded}
            onToggleExpand={() => setDrawerExpanded((v) => !v)}
            onClose={() => {
              setOpenId(null);
              setDrawerExpanded(false);
            }}
          />
        )}
      </Drawer>
    </Stack>
  );
}
