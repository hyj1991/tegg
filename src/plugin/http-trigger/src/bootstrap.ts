import http, { Server } from 'http';
import detect from 'detect-port';
import { DefaultContext } from 'koa';
import {
  ArtusApplication, LifecycleHookUnit,
  ApplicationLifecycle, LifecycleHook, WithApplication, WithContainer
} from '@artus/core';
import { Container, ScopeEnum } from '@artus/injection';
import { ORIGIN_SERVER, KOA_APPLICATION, KOA_ROUTER, KOA_CONTEXT, TEGG_CONTEXT } from './constant';
import { registerController } from './utils/index';
import HttpTrigger from './trigger';
import KoaApplication from './thridparty/koa';
import KoaRouter from './thridparty/router';

@LifecycleHookUnit()
export default class BootTrap implements ApplicationLifecycle {
  private server: Server;
  private app: ArtusApplication;
  private container: Container;

  constructor(@WithApplication() app: ArtusApplication, @WithContainer() container: Container) {
    this.app = app;
    this.container = container;
  }

  get koaApp(): KoaApplication {
    return this.container.get(KoaApplication);
  }

  get koaRouter(): KoaRouter {
    return this.container.get(KoaRouter);
  }

  @LifecycleHook('willReady')
  async initKoa() {
    const app = this.app;
    app.getContainer().set({ id: KOA_APPLICATION, value: this.koaApp });
    app.getContainer().set({ id: KOA_ROUTER, value: this.koaRouter });

    this.koaApp.use(async (koaCtx: DefaultContext) => {
      const ctx = await this.app.trigger.initContext();
      koaCtx.teggCtx = ctx;

      // set execution container
      ctx.container.set({ id: KOA_CONTEXT, value: koaCtx, scope: ScopeEnum.EXECUTION });
      ctx.container.set({ id: TEGG_CONTEXT, value: ctx, scope: ScopeEnum.EXECUTION });

      // await this.app.trigger.startPipeline(ctx);
    });
  }

  @LifecycleHook('willReady')
  async register() {
    registerController(this.app.trigger as HttpTrigger, this.container);
    this.koaApp.use(this.koaRouter.routes());
    this.koaApp.use(this.koaRouter.allowedMethods());
  }

  @LifecycleHook()
  async didReady() {
    const config = this.app.config;
    const port = config.port;
    const detected = await detect(port);
    if (detected !== port) {
      console.log(`port: ${port} was occupied, try port: ${detected}`);
      config.port = detected;
    }

    this.server = http.createServer(this.koaApp.callback());
    await new Promise(resolve => this.server.listen(config.port, () => resolve(true)));
    console.log(`Server start listening at ${config.port}.`);
  }

  @LifecycleHook('didReady')
  async registerHttpServer() {
    const app = this.app;
    app.getContainer().set({ id: ORIGIN_SERVER, value: this.server });
  }

  @LifecycleHook()
  async beforeClose() {
    this.server?.close();
  }
}
