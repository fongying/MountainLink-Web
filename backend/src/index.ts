import Fastify from 'fastify';
import authPlugin from './auth';
import { startMqttIngest } from './ingest.mqtt';

const fastify = Fastify({ logger: true });

await fastify.register(authPlugin);
// …你的其他路由

fastify.ready().then(() => startMqttIngest(fastify));
fastify.listen({ port: Number(process.env.PORT || 4000), host: '0.0.0.0' });
