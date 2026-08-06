import { AppProviders } from './app/providers.tsx';
import { AppRouter } from './app/router.tsx';

function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

export default App;
