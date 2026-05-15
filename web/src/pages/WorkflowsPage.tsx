import { useMemo, useState } from 'react';
import { Badge, Drawer, Group, Stack } from '@mantine/core';
import {
  MantineReactTable,
  useMantineReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table';

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

export function WorkflowsPage() {
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<
    { id: string; value: unknown }[]
  >([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const nameFilter = String(
    columnFilters.find((f) => f.id === 'name')?.value ?? '',
  );
  const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as
    | string
    | undefined;

  const params = useMemo(
    () => ({
      statuses: statusFilter ? [Number(statusFilter) as WorkflowStatus] : [],
      name: nameFilter,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      sortDesc: sorting[0]?.desc ?? true,
    }),
    [statusFilter, nameFilter, pagination, sorting],
  );

  const { data, isLoading, isFetching, refetch } = useWorkflows(params);
  const namesQuery = useWorkflowNames();
  const nameOptions = useMemo(
    () => (namesQuery.data?.names ?? []).map((n) => ({ value: n, label: n })),
    [namesQuery.data?.names],
  );

  const columns = useMemo<MRT_ColumnDef<Workflow>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        enableColumnFilter: false,
        Cell: ({ cell }) => (
          <code style={{ fontSize: 12 }}>{truncate(cell.getValue<string>(), 28)}</code>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        filterVariant: 'select',
        mantineFilterSelectProps: {
          data: nameOptions,
          searchable: true,
          placeholder: 'Filter by type…',
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        filterVariant: 'select',
        mantineFilterSelectProps: {
          data: STATUS_OPTIONS,
        },
        Cell: ({ cell }) => {
          const s = cell.getValue<WorkflowStatus>();
          return (
            <Badge color={STATUS_COLOR[s]} variant="light">
              {STATUS_LABEL[s]}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'authenticatedUser',
        header: 'User',
        enableColumnFilter: false,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        enableColumnFilter: false,
        Cell: ({ row }) => formatTimestamp(row.original.createdAt),
      },
    ],
    [],
  );

  const table = useMantineReactTable<Workflow>({
    columns,
    data: data?.workflows ?? [],
    rowCount: data?.total ?? 0,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    enableColumnActions: false,
    enableHiding: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    state: {
      pagination,
      sorting,
      columnFilters,
      isLoading,
      showProgressBars: isFetching && !isLoading,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    mantineTableBodyRowProps: ({ row }) => ({
      style: { cursor: 'pointer' },
      onClick: () => setOpenId(row.original.id),
    }),
    mantinePaperProps: { withBorder: true },
    mantineToolbarAlertBannerProps: { color: 'red' },
    renderTopToolbarCustomActions: () => (
      <Group gap="xs">
        <button onClick={() => refetch()} style={{ display: 'none' }} />
      </Group>
    ),
  });

  return (
    <Stack>
      <StatsBar />
      <MantineReactTable table={table} />
      <Drawer
        opened={!!openId}
        onClose={() => setOpenId(null)}
        position="right"
        size="xl"
        title="Workflow"
        keepMounted={false}
      >
        {openId && <WorkflowDetail id={openId} onClose={() => setOpenId(null)} />}
      </Drawer>
    </Stack>
  );
}
