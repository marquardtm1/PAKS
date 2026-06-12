import { StoreProvider } from '@/store/StoreProvider'
import { AppShell } from '@/components/AppShell'

export function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  )
}
