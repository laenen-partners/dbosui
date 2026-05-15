import { useMemo, useState } from 'react';
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
import { IconRefresh, IconX } from '@tabler/icons-react';

import { useWorkflowNames, useWorkflows } from '../api/queries';
import { WorkflowStatus, type Workflow } from '../gen/dbosui/v1/workflows_pb';
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
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(25);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Workflow>>({
    columnAccessor: 'createdAt',
    direction: 'desc',
  });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  const params = useMemo(
    () => ({
      statuses: statusFilter ? [Number(statusFilter) as WorkflowStatus] : [],
      name: nameFilter ?? '',
      limit: recordsPerPage,
      offset: (page - 1) * recordsPerPage,
      sortDesc: sortStatus.direction === 'desc',
    }),
    [statusFilter, nameFilter, page, recordsPerPage, sortStatus.direction],
  );

  const { data, isLoading, isFetching, refetch } = useWorkflows(params);
  const namesQuery = useWorkflowNames();

  const nameOptions = useMemo(
    () => (namesQuery.data?.names ?? []).map((n) => ({ value: n, label: n })),
    [namesQuery.data?.names],
  );

  const hasFilters = statusFilter !== null || nameFilter !== null;
  const resetFilters = () => {
    setStatusFilter(null);
    setNameFilter(null);
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
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="All statuses"
            data={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            clearable
            w={180}
          />
          <Select
            placeholder="All workflow types"
            data={nameOptions}
            value={nameFilter}
            onChange={(v) => {
              setNameFilter(v);
              setPage(1);
            }}
            searchable
            clearable
            w={240}
            disabled={namesQuery.isLoading}
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
