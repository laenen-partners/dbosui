import { useCallback, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Drawer,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconRefresh,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import { useSearchParams } from 'react-router-dom';

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
  dateToIso,
  formatDuration,
  formatTimestamp,
  truncate,
} from '../lib/format';
import { StatsBar } from '../components/StatsBar';
import { WorkflowDetail } from '../components/WorkflowDetail';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const REFRESH_OPTIONS = [
  { label: 'Off', value: '0' },
  { label: '5s', value: '5000' },
  { label: '10s', value: '10000' },
  { label: '30s', value: '30000' },
  { label: '1m', value: '60000' },
];

/** All filter state is mirrored to URL search params so refresh/share/bookmark preserves the view. */
type FilterShape = {
  status: string | null;
  name: string | null;
  queue: string | null;
  executor: string | null;
  version: string | null;
  user: string | null;
  id: string;
  from: Date | null;
  to: Date | null;
  page: number;
  size: number;
  refresh: number;
};

function readFilters(p: URLSearchParams): FilterShape {
  const parseDate = (s: string | null) => (s ? new Date(s) : null);
  return {
    status: p.get('status'),
    name: p.get('name'),
    queue: p.get('queue'),
    executor: p.get('executor'),
    version: p.get('version'),
    user: p.get('user'),
    id: p.get('id') ?? '',
    from: parseDate(p.get('from')),
    to: parseDate(p.get('to')),
    page: Number(p.get('page') ?? '1') || 1,
    size: Number(p.get('size') ?? '25') || 25,
    refresh: Number(p.get('refresh') ?? '0') || 0,
  };
}

function writeFilters(f: FilterShape): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.name) p.set('name', f.name);
  if (f.queue) p.set('queue', f.queue);
  if (f.executor) p.set('executor', f.executor);
  if (f.version) p.set('version', f.version);
  if (f.user) p.set('user', f.user);
  if (f.id) p.set('id', f.id);
  if (f.from) p.set('from', dateToIso(f.from));
  if (f.to) p.set('to', dateToIso(f.to));
  if (f.page > 1) p.set('page', String(f.page));
  if (f.size !== 25) p.set('size', String(f.size));
  if (f.refresh > 0) p.set('refresh', String(f.refresh));
  return p;
}

export function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const f = useMemo(() => readFilters(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<FilterShape>) => {
      const next = readFilters(searchParams);
      Object.assign(next, patch);
      // Any filter change resets to page 1 unless the patch itself sets a page.
      if (!('page' in patch)) next.page = 1;
      setSearchParams(writeFilters(next), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Workflow>>({
    columnAccessor: 'createdAt',
    direction: 'desc',
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  // Debounce the free-text ID input so we don't refetch on every keystroke.
  const [debouncedId] = useDebouncedValue(f.id, 300);

  const params = useMemo(
    () => ({
      statuses: f.status ? [Number(f.status) as WorkflowStatus] : [],
      name: f.name ?? '',
      queueName: f.queue ?? '',
      executorId: f.executor ?? '',
      applicationVersion: f.version ?? '',
      user: f.user ?? '',
      idPrefix: debouncedId,
      createdAfter: f.from,
      createdBefore: f.to,
      limit: f.size,
      offset: (f.page - 1) * f.size,
      sortDesc: sortStatus.direction === 'desc',
      refetchIntervalMs: f.refresh > 0 ? f.refresh : undefined,
    }),
    [f, debouncedId, sortStatus.direction],
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
    f.status !== null ||
    f.name !== null ||
    f.queue !== null ||
    f.executor !== null ||
    f.version !== null ||
    f.user !== null ||
    f.id !== '' ||
    f.from !== null ||
    f.to !== null;

  const resetFilters = () =>
    update({
      status: null,
      name: null,
      queue: null,
      executor: null,
      version: null,
      user: null,
      id: '',
      from: null,
      to: null,
    });

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
      { accessor: 'name', title: 'Name', sortable: false },
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
        accessor: 'duration',
        title: 'Duration',
        render: (wf: Workflow) => (
          <Text size="sm" c="dimmed">
            {formatDuration(wf.createdAt, wf.updatedAt)}
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
          <TextInput
            placeholder="Workflow ID prefix"
            leftSection={<IconSearch size={14} />}
            value={f.id}
            onChange={(e) => update({ id: e.currentTarget.value })}
            w={220}
          />
          <Select
            placeholder="All statuses"
            data={STATUS_OPTIONS}
            value={f.status}
            onChange={(v) => update({ status: v })}
            clearable
            w={160}
          />
          <Select
            placeholder="All workflow types"
            data={toOptions(names.data?.values)}
            value={f.name}
            onChange={(v) => update({ name: v })}
            searchable
            clearable
            w={200}
            disabled={names.isLoading}
          />
          <Select
            placeholder="All queues"
            data={toOptions(queues.data?.values)}
            value={f.queue}
            onChange={(v) => update({ queue: v })}
            searchable
            clearable
            w={170}
            disabled={queues.isLoading}
          />
          <Select
            placeholder="All executors"
            data={toOptions(executors.data?.values)}
            value={f.executor}
            onChange={(v) => update({ executor: v })}
            searchable
            clearable
            w={170}
            disabled={executors.isLoading}
          />
          <Select
            placeholder="All versions"
            data={toOptions(versions.data?.values)}
            value={f.version}
            onChange={(v) => update({ version: v })}
            searchable
            clearable
            w={150}
            disabled={versions.isLoading}
          />
          <Select
            placeholder="All users"
            data={toOptions(users.data?.values)}
            value={f.user}
            onChange={(v) => update({ user: v })}
            searchable
            clearable
            w={150}
            disabled={users.isLoading}
          />
          <DatePickerInput
            placeholder="From"
            value={f.from}
            onChange={(v) => update({ from: v ? new Date(v) : null })}
            clearable
            w={140}
          />
          <DatePickerInput
            placeholder="To"
            value={f.to}
            onChange={(v) => update({ to: v ? new Date(v) : null })}
            clearable
            w={140}
          />
          {hasFilters && (
            <ActionIcon variant="subtle" color="gray" onClick={resetFilters}>
              <IconX size={16} />
            </ActionIcon>
          )}
          <Box style={{ flex: 1 }} />
          <SegmentedControl
            size="xs"
            value={String(f.refresh)}
            onChange={(v) => update({ refresh: Number(v) })}
            data={REFRESH_OPTIONS}
          />
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
        page={f.page}
        onPageChange={(page) => update({ page })}
        recordsPerPage={f.size}
        onRecordsPerPageChange={(size) => update({ size, page: 1 })}
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
