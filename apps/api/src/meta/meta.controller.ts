import { Controller, Get, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { legalEntity, organization, setOrgId, type Database } from '@fincore/db';
import { REPORT_MESSAGES } from '@fincore/reports';
import { LANGUAGES, type Language, type Messages } from '@fincore/shared';
import { DATABASE } from '../db/db.module.js';
import { OrgGuard } from '../org-context/org.guard.js';
import { OrgId } from '../org-context/org-id.decorator.js';

export interface OrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
}

export interface LegalEntityDto {
  readonly id: string;
  readonly name: string;
  readonly functionalCurrency: string;
  readonly legalForm: string | null;
}

@Controller('v1/meta')
@UseGuards(OrgGuard)
export class MetaController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Who the caller is acting for. RLS scopes `organization` by its own id, so
   * this can only ever return the one tenant the request resolved to.
   */
  @Get('organization')
  async organization(@OrgId() orgId: string): Promise<OrganizationDto> {
    const [row] = await this.db.transaction(async (tx) => {
      await tx.execute(setOrgId(orgId));
      return tx
        .select({
          id: organization.id,
          name: organization.name,
          baseCurrency: organization.baseCurrency,
        })
        .from(organization)
        .where(eq(organization.id, orgId));
    });
    if (row === undefined) {
      throw new NotFoundException({ error: 'unknown_organization' });
    }
    return { id: row.id, name: row.name, baseCurrency: row.baseCurrency.trim() };
  }

  /** The entity picker's options. RLS scopes this to the caller's tenant. */
  @Get('legal-entities')
  async legalEntities(@OrgId() orgId: string): Promise<{ legalEntities: LegalEntityDto[] }> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(setOrgId(orgId));
      return tx
        .select({
          id: legalEntity.id,
          name: legalEntity.name,
          functionalCurrency: legalEntity.functionalCurrency,
          legalForm: legalEntity.legalForm,
        })
        .from(legalEntity)
        .where(eq(legalEntity.orgId, orgId))
        .orderBy(asc(legalEntity.name));
    });

    return {
      legalEntities: rows.map((row) => ({
        id: row.id,
        name: row.name,
        functionalCurrency: row.functionalCurrency.trim(),
        legalForm: row.legalForm,
      })),
    };
  }

  /**
   * Report line labels. The UI holds no financial vocabulary of its own: it
   * renders the key the report gave it, translated here.
   */
  @Get('messages')
  messages(): { languages: readonly Language[]; messages: Messages } {
    // All three languages in one small payload: the UI switches language
    // without a round trip, and a missing translation is visible immediately.
    return { languages: LANGUAGES, messages: REPORT_MESSAGES };
  }
}
