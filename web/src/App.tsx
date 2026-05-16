import {
  AppShell,
  Box,
  Container,
  Group,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  IconActivity,
  IconBell,
  IconCalendarTime,
  IconListDetails,
  IconStack3,
} from '@tabler/icons-react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';

import { NotificationsPage } from './pages/NotificationsPage';
import { QueuesPage } from './pages/QueuesPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { ThemeToggle } from './components/ThemeToggle';

export function App() {
  const location = useLocation();
  const activeTab = location.pathname === '/' ? '/' : location.pathname;

  return (
    <AppShell header={{ height: 60 }} padding={0}>
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
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

            <Tabs value={activeTab} variant="default" h="100%">
              <Tabs.List style={{ borderBottom: 'none' }}>
                <Tabs.Tab
                  value="/"
                  renderRoot={(props) => <Link to="/" {...props} />}
                  leftSection={<IconListDetails size={16} />}
                >
                  Workflows
                </Tabs.Tab>
                <Tabs.Tab
                  value="/queues"
                  renderRoot={(props) => <Link to="/queues" {...props} />}
                  leftSection={<IconStack3 size={16} />}
                >
                  Queues
                </Tabs.Tab>
                <Tabs.Tab
                  value="/schedules"
                  renderRoot={(props) => <Link to="/schedules" {...props} />}
                  leftSection={<IconCalendarTime size={16} />}
                >
                  Schedules
                </Tabs.Tab>
                <Tabs.Tab
                  value="/notifications"
                  renderRoot={(props) => <Link to="/notifications" {...props} />}
                  leftSection={<IconBell size={16} />}
                >
                  Notifications
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>

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
            <Route path="/queues" element={<QueuesPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
