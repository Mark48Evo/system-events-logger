import amqplib from 'amqplib';
import UUIDv4 from 'uuid/v4';
import program from 'commander';
import Debug from 'debug';
import { Client as ElasticSearch } from 'elasticsearch';
import { indexTemplate, indexPipeline } from './elasticSearchMapping';

const debug = Debug('system-events-logger');

const pkg = require('../package.json');

program
  .version(pkg.version);

const config = {
  elasticSearch: {
    host: process.env.ELASTICSEARCH_HOST || '127.0.0.1:9200',
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'amqp://localhost',
    exchangeName: process.env.EXCHANGE_NAME || 'system_events',
    queueNamePrefix: process.env.EXCHANGE_NAME || 'system_events',
  },
};

const es = new ElasticSearch({
  host: config.elasticSearch.host,
});

async function pingES() {
  try {
    await es.ping({
      requestTimeout: 30000,
    });
  } catch (e) {
    console.error(`ElasticSearch "${config.elasticSearch.host}" is down. Error: "${e.message}"`);

    process.exit(1);
  }
}

function esErrorHandling(e) {
  console.error(`ElasticSearch error: "${e.message}"`);

  process.exit(1);
}

async function main() {
  await pingES();

  const connect = await amqplib.connect('amqp://localhost');
  const channel = await connect.createChannel();

  const consumeQueueName = `${config.rabbitmq.queueNamePrefix}.${UUIDv4()}`;

  await channel.assertExchange(config.rabbitmq.exchangeName, 'fanout', { durable: true });
  await channel.assertQueue(consumeQueueName, { exclusive: true });
  await channel.bindQueue(consumeQueueName, config.rabbitmq.exchangeName, '');

  debug('System Event Logger Started');

  channel.consume(consumeQueueName, async (rawMessage) => {
    const message = JSON.parse(rawMessage.content.toString());

    try {
      const response = await es.index({
        index: 'system_events',
        type: 'systemEvent',
        pipeline: 'system_events_pipeline',
        id: message.metadata.id,
        body: {
          eventName: message.eventName,
          data: message.data,
          metadata: message.metadata,
          createdAt: message.metadata.createdAt,
        },
      });

      if (response.result !== 'created') {
        console.error(response);
      } else {
        debug(`Event "${message.eventName}" with id "${message.metadata.id}" saved.`);
      }
    } catch (e) {
      esErrorHandling(e);
    }
  });
}

async function setup(force = false) {
  await pingES();

  try {
    await es.indices.putTemplate({
      name: 'system_events_template',
      body: indexTemplate,
      create: force,
    });
  } catch (e) {
    esErrorHandling(e);
  }

  try {
    await es.ingest.putPipeline({
      id: 'system_events_pipeline',
      body: indexPipeline,
    });
  } catch (e) {
    esErrorHandling(e);
  }
}

program.command('setup')
  .description('Creates ElasticSearch index templates & pipeline templates')
  .option('-f, --force', 'Force creation')
  .action(options => setup(options.force));

program.command('main')
  .description('Main logging process')
  .action(() => {
    main();
  });

program.parse(process.argv);
