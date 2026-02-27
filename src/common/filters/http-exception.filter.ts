import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message } = this.normalizeException(exception);

    const errorResponse: ErrorResponse = {
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json(errorResponse);
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const msg = (response as { message: string | string[] }).message;
        return {
          statusCode: status,
          code: this.statusToCode(status),
          message: Array.isArray(msg) ? msg[0] : msg,
        };
      }

      return {
        statusCode: status,
        code: this.statusToCode(status),
        message: exception.message,
      };
    }

    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
      [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
    };
    return map[status] ?? 'ERROR';
  }
}
