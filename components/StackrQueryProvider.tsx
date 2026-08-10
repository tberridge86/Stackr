import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { ReactNode } from 'react';
import { stackrQueryClient, stackrQueryTiming } from '../lib/stackrQuery';

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'stackr:tanstack-query-cache:v1',
  throttleTime: 2000,
});

export function StackrQueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={stackrQueryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: stackrQueryTiming.cacheMaxAgeMs,
        buster: 'stackr-phase-2',
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
