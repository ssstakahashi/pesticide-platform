import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { ReviewPage } from './routes/review';
import { RootLayout } from './routes/root';
import { SearchPage } from './routes/search';
import { VerifyPage } from './routes/verify';

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const SearchParamsSchema = z.object({
  crop: z.string().trim().min(1).optional().catch(undefined),
  pest: z.string().trim().min(1).optional().catch(undefined),
  category: z.string().trim().min(1).optional().catch(undefined),
});

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: SearchParamsSchema,
  component: SearchPage,
});

export const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify',
  component: VerifyPage,
});

export const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  component: ReviewPage,
});

const routeTree = rootRoute.addChildren([searchRoute, verifyRoute, reviewRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
