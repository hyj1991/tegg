import 'reflect-metadata';
import { IncomingMessage } from 'http';
import { Context, Next } from '@artus/pipeline';
import { Constructable, Injectable, ScopeEnum } from '@artus/injection';
import { CONSTRUCTOR_PARAMS, CONSTRUCTOR_PARAMS_CONTEXT } from '@artus/core';
import HttpTrigger from './trigger';
import { ORIGIN_REQ } from './constant';

export const enum HTTPMethodEnum {
  GET = 'GET',
  POST = 'POST',
  DELETE = ' DELETE',
  PUT = 'PUT',
}

export type ControllerParams = {
  path?: string
};

export type HttpParams = {
  method: HTTPMethodEnum,
  path: string
};

export type ControllerMeta = {
  prefix: string,
  clazz: Constructable
};

export const controllerMap = new Set<ControllerMeta>();

export const HOOK_HTTP_META_PREFIX = 'ARTUS#HOOK_HTTP_META_PREFIX::';

export function registerController(trigger: HttpTrigger) {
  for (const controller of controllerMap) {
    const { prefix, clazz } = controller;
    const fnMetaKeys = Reflect.getMetadataKeys(clazz);

    for (let key of fnMetaKeys) {
      if (typeof key !== 'string') {
        continue;
      }
      if (!key.startsWith(HOOK_HTTP_META_PREFIX)) {
        continue;
      }

      // register controller
      const { method, path } = Reflect.getMetadata(key, clazz);
      key = key.replace(HOOK_HTTP_META_PREFIX, '');

      // match router
      trigger.use(async (ctx: Context, next: Next) => {
        const req = ctx.container.get(ORIGIN_REQ) as IncomingMessage;
        if (req.url === `${prefix}${path}` && req.method === method) {
          const instance: any = ctx.container.get(clazz);
          const target = instance[key];
          const params: any = Reflect.getMetadata(CONSTRUCTOR_PARAMS, target) ?? [];
          const paramsMap = {
            [CONSTRUCTOR_PARAMS_CONTEXT]: ctx,
          };
          ctx.output.data.content = await target.call(instance, ...params.map(param => paramsMap[param]));
        }
        await next();
      });
    }
  }
}

export function HttpController(options?: ControllerParams): ClassDecorator {
  const prefix = options?.path ?? '';
  return (target: any) => {
    controllerMap.add({ prefix, clazz: target });
    Injectable({ scope: ScopeEnum.EXECUTION })(target);
  };
}

export function HttpMethod(options: HttpParams): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    if (typeof propertyKey === 'symbol') {
      throw new Error(`http hookName is not support symbol [${propertyKey.description}]`);
    }
    Reflect.defineMetadata(`${HOOK_HTTP_META_PREFIX}${propertyKey}`, options, target.constructor);
  };
}

