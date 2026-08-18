import type { EventHandler, Logger } from '@inavitas/shared';

/**
 * network-service Kafka event dinleyici işleyicisi.
 */
export function createNetworkEventHandler(logger: Logger): EventHandler {
  return async (topic, _message) => {
    logger.debug({ topic }, 'network-service henüz olay işlemiyor');
  };
}
