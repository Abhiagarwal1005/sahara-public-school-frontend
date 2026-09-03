import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data is considered fresh for 30 seconds. In an office where four
            // people work at once this saves a good number of requests — and it
            // matches the backend's Cache-Control headers.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: (count, err) => {
                // Retrying a 4xx is pointless — the request itself is wrong
                if (err?.status >= 400 && err?.status < 500) return false;
                return count < 2;
            },
            refetchOnWindowFocus: false,
        },
        mutations: { retry: false },
    },
});
