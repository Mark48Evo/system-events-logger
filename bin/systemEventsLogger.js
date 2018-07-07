#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var amqplib = _interopDefault(require('amqplib'));
var RabbitMQPubSub = _interopDefault(require('@mark48evo/rabbitmq-pubsub'));
var program = _interopDefault(require('commander'));
var Debug = _interopDefault(require('debug'));
var elasticsearch = require('elasticsearch');

const indexTemplate = {
  index_patterns: ['system_events_*'],
  mappings: {
    systemEvent: {
      properties: {
        eventName: {
          type: 'keyword'
        },
        data: {
          type: 'object',
          dynamic: false,
          properties: {}
        },
        metadata: {
          type: 'object',
          properties: {
            id: {
              type: 'keyword'
            },
            processId: {
              type: 'integer'
            },
            processName: {
              type: 'keyword'
            },
            createdAt: {
              type: 'date',
              format: 'epoch_second'
            }
          }
        },
        createdAt: {
          type: 'date',
          format: 'epoch_second'
        }
      }
    }
  },
  aliases: {
    system_events: {}
  }
};
const indexPipeline = {
  description: 'Appends date to index name on systemEvent index',
  processors: [{
    date_index_name: {
      field: 'createdAt',
      index_name_prefix: 'system_events_',
      date_rounding: 'd',
      date_formats: ['UNIX']
    }
  }]
};

const debug = Debug('system-events-logger');

const pkg = require('../package.json');

program.version(pkg.version);
const config = {
  elasticSearch: {
    host: process.env.ELASTICSEARCH_HOST || '127.0.0.1:9200'
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'amqp://localhost',
    exchangeName: process.env.EXCHANGE_NAME || 'system_events',
    queueNamePrefix: process.env.EXCHANGE_NAME || 'system_events'
  }
};
const es = new elasticsearch.Client({
  host: config.elasticSearch.host
});

async function pingES() {
  try {
    await es.ping({
      requestTimeout: 30000
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
  const pubsub = new RabbitMQPubSub(channel, config.rabbitmq);
  await pubsub.setup();
  debug('System Event Logger Started');
  pubsub.on('*', async message => {
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
          createdAt: message.metadata.createdAt
        }
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
      create: force
    });
  } catch (e) {
    esErrorHandling(e);
  }

  try {
    await es.ingest.putPipeline({
      id: 'system_events_pipeline',
      body: indexPipeline
    });
  } catch (e) {
    esErrorHandling(e);
  }
}

program.command('setup').description('Creates ElasticSearch index templates & pipeline templates').option('-f, --force', 'Force creation').action(options => setup(options.force));
program.command('main').description('Main logging process').action(() => {
  main();
});
program.parse(process.argv);
