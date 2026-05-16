import type { ComponentType } from 'react';
import {
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  ThemeIcon,
  Text,
  Stack,
} from '@mantine/core';
import {
  IconActivity,
  IconBan,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  type IconProps,
} from '@tabler/icons-react';

import { useActivity, useStats } from '../api/queries';
import type { ActivityBucket } from '../gen/dbosui/v1/workflows_pb';
import { Sparkline } from './Sparkline';

type StatKey = 'total' | 'pending' | 'success' | 'failed' | 'cancelled';

type Tile = {
  label: string;
  key: StatKey;
  color: string;
  cssVar: string;
  Icon: ComponentType<IconProps>;
};

const TILES: Tile[] = [
  { label: 'Total',     key: 'total',     color: 'brand',  cssVar: 'var(--mantine-color-brand-6)',  Icon: IconActivity },
  { label: 'Pending',   key: 'pending',   color: 'yellow', cssVar: 'var(--mantine-color-yellow-6)', Icon: IconClock },
  { label: 'Success',   key: 'success',   color: 'green',  cssVar: 'var(--mantine-color-green-6)',  Icon: IconCircleCheck },
  { label: 'Failed',    key: 'failed',    color: 'red',    cssVar: 'var(--mantine-color-red-6)',    Icon: IconCircleX },
  { label: 'Cancelled', key: 'cancelled', color: 'gray',   cssVar: 'var(--mantine-color-gray-6)',   Icon: IconBan },
];

function bucketSeries(buckets: ActivityBucket[], key: StatKey): number[] {
  return buckets.map((b) => b[key] ?? 0);
}

export function StatsBar() {
  const { data, isLoading } = useStats();
  const activity = useActivity(24);
  const stats = data?.stats;
  const buckets = activity.data?.buckets ?? [];

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm">
      {TILES.map((t) => {
        const value = stats?.[t.key];
        const pct =
          t.key !== 'total' && stats && stats.total > 0
            ? Math.round(((value ?? 0) / stats.total) * 100)
            : null;
        const series = bucketSeries(buckets, t.key);

        return (
          <Card key={t.key} withBorder padding="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed" fw={500} tt="uppercase">
                  {t.label}
                </Text>
                {isLoading || !stats ? (
                  <Skeleton height={28} width={56} />
                ) : (
                  <Group gap="xs" align="baseline">
                    <Text fw={700} fz="xl" lh={1}>
                      {value}
                    </Text>
                    {pct !== null && (
                      <Text size="xs" c="dimmed">
                        {pct}%
                      </Text>
                    )}
                  </Group>
                )}
                {series.some((v) => v > 0) && (
                  <Sparkline
                    values={series}
                    stroke={t.cssVar}
                    fill={t.cssVar}
                    width={120}
                    height={24}
                  />
                )}
              </Stack>
              <ThemeIcon variant="light" color={t.color} size={36} radius="md">
                <t.Icon size={20} />
              </ThemeIcon>
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
