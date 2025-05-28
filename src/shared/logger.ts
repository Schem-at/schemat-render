const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return `${prefix} ${message} ${args.length ? JSON.stringify(args) : ''}`;
}

export const logger = {
  error: (message: string, ...args: any[]) => {
    if (shouldLog('error')) console.error(formatMessage('error', message, ...args));
  },
  warn: (message: string, ...args: any[]) => {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, ...args));
  },
  info: (message: string, ...args: any[]) => {
    if (shouldLog('info')) console.info(formatMessage('info', message, ...args));
  },
  debug: (message: string, ...args: any[]) => {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, ...args));
  },
};
