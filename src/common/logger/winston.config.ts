import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  printf(({ timestamp, level, message, context, ...meta }) => {
    const ctx = context ? `[${context as string}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp as string} ${level} ${ctx} ${message as string}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), json());

const isDebug = process.env.DEBUG_MODE === 'true';

export const winstonConfig: WinstonModuleOptions = {
  level: isDebug ? 'debug' : 'error',
  transports: [
    new winston.transports.Console({
      format: isDebug ? devFormat : prodFormat,
    }),
  ],
};
