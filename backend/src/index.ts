import Fastify from 'fastify';
import authPlugin from './auth';
import { startMqttIngest } from './ingest.mqtt';

const fastify = Fastify({ logger: true });

await fastify.register(authPlugin);
// �K�A����L����

fastify.ready().then(() => startMqttIngest(fastify));
fastify.listen({ port: Number(process.env.PORT || 4000), host: '0.0.0.0' });
