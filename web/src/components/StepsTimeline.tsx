import { Box, Group, Text, Tooltip, useMantineTheme } from '@mantine/core';

import type { Step } from '../gen/dbosui/v1/workflows_pb';
import { formatDuration, timestampToMs } from '../lib/format';

type Props = { steps: Step[] };

/**
 * Compact Gantt-style timeline of workflow steps. Steps with no timing data
 * collapse to a centred marker. Errored steps are rendered red.
 */
export function StepsTimeline({ steps }: Props) {
  const theme = useMantineTheme();
  const segments = steps
    .map((s) => ({
      step: s,
      start: timestampToMs(s.startedAt),
      end: timestampToMs(s.completedAt),
    }))
    .filter((seg) => seg.start > 0 || seg.end > 0);

  if (segments.length === 0) return null;

  const t0 = Math.min(...segments.map((s) => s.start || s.end));
  const t1 = Math.max(...segments.map((s) => s.end || s.start));
  const span = Math.max(1, t1 - t0);

  return (
    <Box>
      <Group justify="space-between" mb={6}>
        <Text size="xs" c="dimmed">
          Timeline
        </Text>
        <Text size="xs" c="dimmed">
          Total: {formatDuration(steps[0]?.startedAt, steps.at(-1)?.completedAt)}
        </Text>
      </Group>
      <Box style={{ position: 'relative', height: segments.length * 22 + 8 }}>
        {segments.map((seg, i) => {
          const left = ((seg.start - t0) / span) * 100;
          const width = Math.max(((seg.end - seg.start) / span) * 100, 0.5);
          const color = seg.step.error
            ? theme.colors.red[6]
            : theme.colors.brand[6];

          return (
            <Tooltip
              key={seg.step.stepId}
              label={
                <Box>
                  <Text size="xs" fw={600}>
                    #{seg.step.stepId} {seg.step.name}
                  </Text>
                  <Text size="xs">
                    {formatDuration(seg.step.startedAt, seg.step.completedAt)}
                  </Text>
                </Box>
              }
              withinPortal
            >
              <Box
                style={{
                  position: 'absolute',
                  top: i * 22,
                  left: `${left}%`,
                  width: `${width}%`,
                  height: 16,
                  background: color,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  paddingInline: 6,
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'default',
                }}
              >
                {seg.step.name}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
