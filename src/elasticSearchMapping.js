export const indexTemplate = {
  index_patterns: ['system_events_*'],
  mappings: {
    systemEvent: {
      properties: {
        eventName: {
          type: 'keyword',
        },
        data: {
          type: 'object',
          dynamic: false,
          properties: {},
        },
        metadata: {
          type: 'object',
          properties: {
            id: {
              type: 'keyword',
            },
            processId: {
              type: 'integer',
            },
            processName: {
              type: 'keyword',
            },
            createdAt: {
              type: 'date',
              format: 'epoch_second',
            },
          },
        },
        createdAt: {
          type: 'date',
          format: 'epoch_second',
        },
      },
    },
  },
  aliases: {
    system_events: {},
  },
};

export const indexPipeline = {
  description: 'Appends date to index name on systemEvent index',
  processors: [
    {
      date_index_name: {
        field: 'createdAt',
        index_name_prefix: 'system_events_',
        date_rounding: 'd',
        date_formats: ['UNIX'],
      },
    },
  ],
};
