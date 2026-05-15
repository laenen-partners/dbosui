import { AppShell, Box, Container, Group, Text, Title } from '@mantine/core';
import { IconActivity } from '@tabler/icons-react';
import { Route, Routes } from 'react-router-dom';

import { WorkflowsPage } from './pages/WorkflowsPage';
import { ThemeToggle } from './components/ThemeToggle';

export function App() {
  return (
    <AppShell header={{ height: 60 }} padding={0}>
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="sm">
              <Box
                bg="var(--mantine-color-brand-6)"
                c="white"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconActivity size={18} />
              </Box>
              <Box>
                <Title order={5} fz="md" lh={1}>
                  DBOS Admin
                </Title>
                <Text size="xs" c="dimmed" lh={1.4}>
                  Workflow inspector
                </Text>
              </Box>
            </Group>
            <Group gap="xs">
              <ThemeToggle />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main bg="var(--mantine-color-default-hover)">
        <Container size="xl" py="lg">
          <Routes>
            <Route path="/" element={<WorkflowsPage />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
