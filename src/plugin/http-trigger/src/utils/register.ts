import { Container, Constructable } from '@artus/injection';
import { Context, Next } from '@artus/pipeline';
import { ControllerMeta, MiddlewareMeta } from '../type';
import HttpTrigger from '../trigger';
import { DefaultContext, KoaRouter } from '../thridparty/index';
import {
  KOA_ROUTER, HOOK_HTTP_META_PREFIX, TEGG_OUTPUT, TEGG_ROUTER,
  KOA_CONTEXT, PARAMS, QUERY, BODY, HOOK_CONTROLLER_PARAMS_PREFIX,
  HOOK_MIDDLEWARE_META_PREFIX,
} from '../constant';

type TeggRouter = {
  clazz: Constructable,
  attr: string,
};

export const controllerMap = new Set<ControllerMeta>();

export const middlewareMap = new Set<MiddlewareMeta>();

export function registerController(trigger: HttpTrigger, container: Container) {
  const router = container.get<KoaRouter>(KOA_ROUTER);

  for (const controller of controllerMap) {
    const { prefix, clazz } = controller;

    const fnMetaKeys = Reflect.getMetadataKeys(clazz);
    const childRouter = router.instance();

    for (let key of fnMetaKeys) {
      if (typeof key !== 'string') {
        continue;
      }
      if (!key.startsWith(HOOK_HTTP_META_PREFIX)) {
        continue;
      }

      // register tegg controller
      const { method, path } = Reflect.getMetadata(key, clazz);
      key = key.replace(HOOK_HTTP_META_PREFIX, '');

      // register koa controller
      const koaMiddleware = async function(koaCtx: DefaultContext, next) {
        const { teggCtx } = koaCtx;
        const router: TeggRouter = { attr: key, clazz };
        teggCtx.container.set({ id: TEGG_ROUTER, value: router });
        await next();
      };
      if (prefix) {
        childRouter[method.toLowerCase()](path, koaMiddleware);
      } else {
        router[method.toLowerCase()](path, koaMiddleware);
      }
    }

    if (prefix) {
      router.use(prefix, childRouter.routes());
    }
  }

  const teggMiddleware = async function(ctx: Context, next: Next) {
    registerParams(ctx.container);
    try {
      const { attr, clazz } = ctx.container.get<TeggRouter>(TEGG_ROUTER);
      const instance = ctx.container.get<Constructable>(clazz);

      const koaCtx = ctx.container.get<DefaultContext>(KOA_CONTEXT);
      const inject = {
        [PARAMS]: koaCtx.params,
        [QUERY]: koaCtx.query,
        [BODY]: koaCtx.request.body,
      };
      const params = Reflect.getMetadata(`${HOOK_CONTROLLER_PARAMS_PREFIX}${attr}`, clazz) ?? [];
      const args = params.map((key: string) => inject[key]);
      const output = await instance[attr](...args);
      ctx.container.set({ id: TEGG_OUTPUT, value: output ?? null });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        throw err;
      }
    }
    await next();
  };
  trigger.use(teggMiddleware);
}

export function registerMiddleware(trigger: HttpTrigger, container: Container) {
  for (const middleware of middlewareMap) {
    middleware; trigger; container;

    const { clazz } = middleware;

    const fnMetaKeys = Reflect.getMetadataKeys(clazz);
    for (let key of fnMetaKeys) {
      if (typeof key !== 'string') {
        continue;
      }
      if (!key.startsWith(HOOK_MIDDLEWARE_META_PREFIX)) {
        continue;
      }

      const { path } = Reflect.getMetadata(key, clazz);
      key = key.replace(HOOK_MIDDLEWARE_META_PREFIX, '');
      if (path) {

      } else {
        trigger.use(async function(ctx: Context, next: Next) {
          const instance = ctx.container.get<Constructable>(clazz);
          const output = await instance[key](next);
          if (output) {
            ctx.container.set({ id: TEGG_OUTPUT, value: output });
          }
        });
      }
    }
  }
}

export function registerParams(container: Container) {
  const koaCtx = container.get<DefaultContext>(KOA_CONTEXT);

  container.set({ id: QUERY, value: koaCtx.query ?? {} });
  container.set({ id: PARAMS, value: koaCtx.params ?? {} });
  container.set({ id: BODY, value: koaCtx.request.body ?? {} });
}

