import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import {
  CodeHighlightAdapterProvider,
  createHighlightJsAdapter,
} from '@mantine/code-highlight';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/code-highlight/styles.css';
import 'mantine-datatable/styles.css';
import 'highlight.js/styles/atom-one-dark.css';

import { hljs } from './lib/hljs';
import { App } from './App';
import { theme } from './theme';

const codeHighlightAdapter = createHighlightJsAdapter(hljs);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
});

// React Router uses the document's <base href> when basename is unset.
const basename = new URL(document.baseURI).pathname.replace(/\/$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <CodeHighlightAdapterProvider adapter={codeHighlightAdapter}>
        <ModalsProvider>
          <Notifications position="top-right" />
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={basename}>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  </StrictMode>,
);
