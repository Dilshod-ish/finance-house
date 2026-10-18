import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { organization, type Database } from '@fincore/db';
import {
  createOperations,
  type AssignResult,
  type BatchSummary,
  type ImportResult,
  type InboxRow,
  type Operations,
  type OperationsError,
  type OperationsErrorCode,
  type RevertResult,
} from '@fincore/operations';
import type { RegionPack } from '@fincore/region-pack-contract';
import { DATABASE } from '../db/db.module.js';
import { packByCode } from '../region/packs.js';
import { operationsErrorDto } from './operations.presenter.js';

/**
 * Which HTTP status each refusal is. Written out rather than defaulted, so a
 * new refusal code has to be given a status deliberately: a 500 for something
 * the caller can fix teaches them to retry, and a 400 for a conflict teaches
 * them to edit the file.
 */
const STATUS: Readonly<
  Record<OperationsErrorCode, 'bad_request' | 'conflict' | 'not_found' | 'unprocessable'>
> = {
  unknown_template: 'bad_request',
  invalid_file: 'unprocessable',
  already_imported: 'conflict',
  unknown_account: 'unprocessable',
  currency_mismatch: 'unprocessable',
  missing_gl_account: 'unprocessable',
  missing_fx_rate: 'unprocessable',
  unknown_batch: 'not_found',
  batch_already_reverted: 'conflict',
  unknown_operation: 'not_found',
  unknown_article: 'not_found',
  operation_not_live: 'conflict',
  posting_refused: 'unprocessable',
};

function raise(error: OperationsError): never {
  const body = operationsErrorDto(error);
  const status = STATUS[error.code];
  if (status === 'bad_request') throw new BadRequestException(body);
  if (status === 'conflict') throw new ConflictException(body);
  if (status === 'not_found') throw new NotFoundException(body);
  throw new UnprocessableEntityException(body);
}

/**
 * The seam between HTTP and `@fincore/operations`. It resolves the tenant's
 * region pack and turns refusals into statuses; it computes nothing.
 */
@Injectable()
export class OperationsService {
  private readonly operations: Operations;

  constructor(@Inject(DATABASE) private readonly db: Database) {
    this.operations = createOperations(db);
  }

  /**
   * The pack the organization was created with — never a default.
   *
   * Read inside a transaction that sets `app.org_id`: `organization` is behind
   * row level security scoped by its own id (I8), so the same query outside
   * one returns no rows and the organization looks as if it did not exist.
   */
  private async packFor(orgId: string): Promise<RegionPack> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
      return tx
        .select({ regionPack: organization.regionPack })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);
    });
    const code = rows[0]?.regionPack;
    if (code === undefined) {
      throw new NotFoundException({
        error: 'unknown_organization',
        message: `Organization ${orgId} does not exist.`,
      });
    }
    return packByCode(code);
  }

  async importStatement(orgId: string, fileName: string, bytes: Uint8Array): Promise<ImportResult> {
    if (bytes.byteLength === 0) {
      throw new BadRequestException({
        error: 'empty_body',
        message: 'Send the workbook as the request body (application/octet-stream).',
      });
    }
    const result = await this.operations.importBankStatement({
      orgId,
      pack: await this.packFor(orgId),
      fileName,
      bytes,
    });
    return result.ok ? result.value : raise(result.error);
  }

  async inbox(orgId: string, limit: number): Promise<InboxRow[]> {
    return this.operations.listInbox(orgId, limit);
  }

  async batches(orgId: string, limit: number): Promise<BatchSummary[]> {
    return this.operations.listBatches(orgId, limit);
  }

  async assign(
    orgId: string,
    operationId: string,
    articleId: string,
    directionId: string | null,
  ): Promise<AssignResult> {
    const result = await this.operations.assignArticle({
      orgId,
      pack: await this.packFor(orgId),
      operationId,
      articleId,
      directionId,
    });
    return result.ok ? result.value : raise(result.error);
  }

  async revert(orgId: string, batchId: string, reason: string): Promise<RevertResult> {
    const result = await this.operations.revertBatch({ orgId, batchId, reason });
    return result.ok ? result.value : raise(result.error);
  }
}
