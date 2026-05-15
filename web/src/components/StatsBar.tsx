import { Card, Group, SimpleGrid, Skeleton, Text } from '@mantine/core';

import { useStats } from '../api/queries';

type Tile = { label: string; key: 'total' | 'pending' | 'success' | 'failed' | 'cancelled'; color: string };

const TILES: Tile[] = [
  { label: 'Total', key: 'total', color: 'gray' },
  { label: 'Pending', key: 'pending', color: 'yellow' },
  { label: 'Success', key: 'success', color: 'green' },
  { label: 'Failed', key: 'failed', color: 'red' },
  { label: 'Cancelled', key: 'cancelled', color: 'gray' },
];

export function StatsBar() {
  const { data, isLoading } = useStats();
  const stats = data?.stats;

  return (
    <SimpleGrid cols={{ base: 2, sm: 5 }} mb="md">
      {TILES.map((t) => (
        <Card key={t.key} withBorder>
          <Group justify="space-between" align="flex-end">
            <Text size="sm" c="dimmed">
              {t.label}
            </Text>
            {isLoading || !stats ? (
              <Skeleton height={28} width={48} />
            ) : (
              <Text fw={700} size="xl" c={t.color}>
                {stats[t.key]}
              </Text>
            )}
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
