import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { parseQuery } from '../http/query.js';
import { OrgGuard } from '../org-context/org.guard.js';
import { OrgId } from '../org-context/org-id.decorator.js';
import { assignBodySchema, listQuerySchema, revertBodySchema } from './dto.js';
import {
  batchSummaryDto,
  importResultDto,
  inboxRowDto,
  type BatchSummaryDto,
  type ImportResultDto,
  type InboxRowDto,
} from './operations.presenter.js';
import { OperationsService } from './operations.service.js';

/**
 * The raw body the octet-stream parser leaves on the request. Express types
 * `body` as `any`, so it is narrowed to `unknown` here and checked below:
 * trusting the declared type would let a JSON body through as a Buffer.
 */
type RawRequest = Omit<Request, 'body'> & { readonly body?: unknown };

@Controller('v1/operations')
@UseGuards(OrgGuard)
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  /**
   * The workbook itself is the request body. No multipart: one file per
   * request is the whole contract — the template already says one statement
   * covers one account and one period — and a form parser would be a
   * dependency carrying nothing.
   */
  @Post('import')
  async import(
    @OrgId() orgId: string,
    @Req() request: RawRequest,
    @Headers('x-fincore-file-name') fileName: string | undefined,
  ): Promise<ImportResultDto> {
    const bytes = Buffer.isBuffer(request.body) ? new Uint8Array(request.body) : new Uint8Array();
    const result = await this.service.importStatement(orgId, fileName ?? 'statement.xlsx', bytes);
    return importResultDto(result);
  }

  /** PRD US-2.2: everything still waiting for an article. */
  @Get('inbox')
  async inbox(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ operations: InboxRowDto[] }> {
    const { limit } = parseQuery(listQuerySchema, raw);
    const rows = await this.service.inbox(orgId, limit);
    return { operations: rows.map(inboxRowDto) };
  }

  @Get('batches')
  async batches(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ batches: BatchSummaryDto[] }> {
    const { limit } = parseQuery(listQuerySchema, raw);
    const batches = await this.service.batches(orgId, limit);
    return { batches: batches.map(batchSummaryDto) };
  }

  /**
   * Classifying an operation is a correction, not an edit: the entry it posted
   * is reversed and a new one takes its place (I4). The response names both.
   */
  @Post(':id/assign')
  @HttpCode(200)
  async assign(
    @OrgId() orgId: string,
    @Param('id') operationId: string,
    @Body() raw: unknown,
  ): Promise<{ operationId: string; reversedEntryId: string; entryId: string }> {
    const body = parseQuery(assignBodySchema, raw);
    return this.service.assign(orgId, operationId, body.articleId, body.directionId ?? null);
  }

  @Post('batches/:id/revert')
  @HttpCode(200)
  async revert(
    @OrgId() orgId: string,
    @Param('id') batchId: string,
    @Body() raw: unknown,
  ): Promise<{ batchId: string; reversedEntryIds: readonly string[] }> {
    const body = parseQuery(revertBodySchema, raw);
    return this.service.revert(orgId, batchId, body.reason);
  }
}
