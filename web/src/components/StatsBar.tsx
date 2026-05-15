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

import { useStats } from '../api/queries';

type Tile = {
  label: string;
  key: 'total' | 'pending' | 'success' | 'failed' | 'cancelled';
  color: string;
  Icon: ComponentType<IconProps>;
};

const TILES: Tile[] = [
  { label: 'Total',     key: 'total',     color: 'brand',  Icon: IconActivity },
  { label: 'Pending',   key: 'pending',   color: 'yellow', Icon: IconClock },
  { label: 'Success',   key: 'success',   color: 'green',  Icon: IconCircleCheck },
  { label: 'Failed',    key: 'failed',    color: 'red',    Icon: IconCircleX },
  { label: 'Cancelled', key: 'cancelled', color: 'gray',   Icon: IconBan },
];

export function StatsBar() {
  const { data, isLoading } = useStats();
  const stats = data?.stats;

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm">
      {TILES.map((t) => {
        const value = stats?.[t.key];
        const pct =
          t.key !== 'total' && stats && stats.total > 0
            ? Math.round(((value ?? 0) / stats.total) * 100)
            : null;
        return (
          <Card key={t.key} withBorder padding="md">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={4}>
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
              </Stack>
              <ThemeIcon
                variant="light"
                color={t.color}
                size={36}
                radius="md"
              >
                <t.Icon size={20} />
              </ThemeIcon>
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
