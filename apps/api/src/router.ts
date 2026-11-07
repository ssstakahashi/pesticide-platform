import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';

/**
 * Zod のバリデーションエラーを API 共通のエラー形式（ErrorSchema）で返すルーター。
 */
export function createRouter<E extends Env = Env>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: '入力内容が不正です',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          400,
        );
      }
    },
  });
}
