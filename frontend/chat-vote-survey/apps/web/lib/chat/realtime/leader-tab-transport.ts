import { createLeaderTabWorker, type LeaderTabWorkerOptions } from "./leader-tab-worker";
import {
  SharedWorkerTransport,
  type SharedWorkerTransportOptions,
} from "./shared-worker-transport";

export type LeaderTabTransportOptions = Omit<SharedWorkerTransportOptions, "createWorker"> & {
  leader?: LeaderTabWorkerOptions;
};

export class LeaderTabTransport extends SharedWorkerTransport {
  constructor({ leader, ...transport }: LeaderTabTransportOptions = {}) {
    super({
      ...transport,
      createWorker: () => createLeaderTabWorker(leader),
    });
  }
}
