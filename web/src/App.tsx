import { AppShell, Group, Title } from '@mantine/core';
import { Route, Routes } from 'react-router-dom';

import { WorkflowsPage } from './pages/WorkflowsPage';

export function App() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>DBOS Admin</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Routes>
          <Route path="/" element={<WorkflowsPage />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
